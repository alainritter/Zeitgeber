#!/usr/bin/env python3
"""Wetterhimmel-Bilder (public/weather/*.webp) per Krea-2 Turbo (InvokeAI-API) erzeugen.

Nur für Maintainer: Die fertigen Bilder liegen im Repo, Nutzer brauchen InvokeAI nicht.

    python3 scripts/weather-images.py --out public/weather --contact /tmp/wx/contact.jpg
    python3 scripts/weather-images.py --out public/weather --only storm,fog --seed 40   # nachwürfeln

Reiner Himmel, ohne Boden, Horizont oder Gebäude, damit die Bilder überall auf der Welt
gleich gelesen werden. Je Szene entsteht zuerst das Tagbild (text2img); Dämmerung und
Nacht werden daraus per img2img abgeleitet, damit die Wolkenform gleich bleibt und sich
die Lichtphasen sauber überblenden lassen.

Als Graph-Vorlage dient das neueste Krea-2-img2img-PNG aus dem InvokeAI-Output-Ordner
(PNG-Chunk `invokeai_graph`, enthält den Node `i2l`). InvokeAI muss laufen
(~/.local/bin/invokeai-launch.sh öffnet auch die Oberfläche; Kaltstart ~8-10 Min).
"""
import argparse, glob, io, json, os, sys, time
import requests
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageStat

API = "http://localhost:9090/api/v1"
OUTPUTS = "/home/a/invokeai/outputs/images"
W, H = 1024, 576

SKY = (
    " Photograph of the sky only, filling the whole frame, no ground, no horizon, no buildings,"
    " no trees, no people, no birds, no aircraft, photorealistic, natural light, no text."
)
# Tagbild je Szene (text2img).
SCENES = {
    "clear": "Deep blue sky with a few very thin high cirrus veils, bright sunlit atmosphere.",
    "partly": "Blue sky with scattered white cumulus clouds.",
    "overcast": "Completely overcast sky, an even grey stratus cloud layer, soft diffuse light.",
    "fog": "Pale milky white-grey haze, almost featureless dense fog, very soft diffuse light.",
    "rain": "Dark heavy grey rain clouds, low nimbostratus, moody dim light.",
    "snow": "Bright pale grey-white winter overcast sky, slightly blue-grey, soft diffuse light.",
    "storm": "Towering dark cumulonimbus storm clouds, dramatic backlit edges, ominous grey-green tones.",
}
# Szenen mit offenem Himmel zeigen nachts Sterne, die übrigen Wolken im Mondlicht.
STARRY = {"clear", "partly"}
TWILIGHT = (
    " Dusk shortly after sunset, dim light: dark blue upper sky fading into a warm orange and pink"
    " glow toward the lower edge of the frame, overall noticeably darker than daytime."
)
NIGHT_STARS = (
    " Deep night, long after sunset: nearly black navy sky full of bright stars, faint milky way,"
    " very dark overall."
)
NIGHT_CLOUDS = (
    " Deep night, long after sunset: very dark, nearly black clouds with only faint cold moonlight"
    " on their edges, very dark overall."
)
# img2img-Stärke (Anteil, der neu entsteht); niedriger lässt den Tag durchscheinen.
STRENGTH = {"twilight": 0.68, "night": 0.88, "night-stars": 0.92}


def template():
    """Neuestes Krea-2-img2img-Graph (mit Node `i2l`) aus den Outputs."""
    for f in sorted(glob.glob(f"{OUTPUTS}/*.png"), key=os.path.getmtime, reverse=True)[:300]:
        raw = Image.open(f).text.get("invokeai_graph")
        if raw and "krea2_denoise" in raw and '"i2l"' in raw:
            return json.loads(raw)
    sys.exit("Kein Krea-2-img2img-PNG mit invokeai_graph in den Outputs gefunden (einmal in der UI erzeugen).")


def text2img(g):
    """Vorlage ohne img2img-Zweig: i2l und seine Kanten entfernen, voll entrauschen."""
    g = json.loads(json.dumps(g))
    g["nodes"].pop("i2l")
    g["edges"] = [e for e in g["edges"] if "i2l" not in (e["source"]["node_id"], e["destination"]["node_id"])]
    g["nodes"]["denoise"]["denoising_start"] = 0.0
    return g


def img2img(g, image_name, strength):
    g = json.loads(json.dumps(g))
    g["nodes"]["i2l"]["image"] = {"image_name": image_name}
    g["nodes"]["denoise"]["denoising_start"] = round(1.0 - strength, 3)
    return g


def run(g, prompt, seed):
    g["nodes"]["p"]["value"] = prompt
    g["nodes"]["seed"]["value"] = seed
    g["nodes"]["denoise"].update(width=W, height=H)
    r = requests.post(f"{API}/queue/default/enqueue_batch", json={"batch": {"graph": g, "runs": 1}})
    r.raise_for_status()
    item_id = r.json()["item_ids"][0]
    while True:
        item = requests.get(f"{API}/queue/default/i/{item_id}").json()
        if item["status"] in ("completed", "failed", "canceled"):
            break
        time.sleep(3)
    if item["status"] != "completed":
        sys.exit(f"Generierung {item['status']}: {item.get('error_message') or ''}")
    name = next(v["image"]["image_name"] for v in item["session"]["results"].values() if "image" in v)
    data = requests.get(f"{API}/images/i/{name}/full").content
    return Image.open(io.BytesIO(data)).convert("RGB")


def upload(im):
    buf = io.BytesIO()
    im.save(buf, "PNG")
    buf.seek(0)
    r = requests.post(
        f"{API}/images/upload",
        params={"image_category": "general", "is_intermediate": "true"},
        files={"file": ("sky.png", buf, "image/png")},
    )
    r.raise_for_status()
    return r.json()["image_name"]


def contact_sheet(images, labels, cols, path):
    tw, th = 320, 180
    rows = (len(images) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw, rows * th), "black")
    d = ImageDraw.Draw(sheet)
    for i, (im, lb) in enumerate(zip(images, labels)):
        x, y = (i % cols) * tw, (i // cols) * th
        sheet.paste(im.resize((tw, th)), (x, y))
        d.rectangle([x, y, x + 150, y + 14], fill="black")
        d.text((x + 3, y + 1), lb, fill="white")
    sheet.save(path, "JPEG", quality=85)


NIGHT_LUMA = 50  # mittlere Helligkeit (0-255), über der ein Nachtbild zu hell wirkt
NIGHT_PEAK = 140  # hellste 5 % der Pixel: strahlend weiße Wolken passen nicht zu Mondlicht
NIGHT_TINT = (14, 22, 48)


def grade_night(im):
    """Zu helle Nachtbilder (bedeckt, Nebel, Schnee: img2img behält den hellen Tag; auch helle
    Wolken vor dunklem Himmel) abdunkeln und kühl einfärben. Bilder unter den Zielwerten
    bleiben unverändert, der Aufruf ist idempotent."""
    grey = im.convert("L")
    luma = ImageStat.Stat(grey).mean[0]
    hist, seen, peak = grey.histogram(), 0, 255
    for v, n in enumerate(hist):
        seen += n
        if seen >= 0.95 * grey.size[0] * grey.size[1]:
            peak = v
            break
    factor = min(NIGHT_LUMA / max(luma, 1), NIGHT_PEAK / max(peak, 1))
    if factor >= 1:
        return im
    im = ImageEnhance.Brightness(im).enhance(factor)
    tint = Image.new("RGB", im.size, NIGHT_TINT)
    return Image.blend(ImageChops.screen(im, tint), im, 0.65)


def save(im, path):
    im.resize((W, H)).save(path, "WEBP", quality=80)
    print(f"{path} ({os.path.getsize(path) // 1024} KB)", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=7, help="Basis-Seed; die Szene i bekommt seed+i")
    ap.add_argument("--only", help="nur diese Szenen, kommagetrennt (zum Nachwürfeln)")
    ap.add_argument("--phases", default="day,twilight,night", help="nur diese Lichtphasen neu erzeugen")
    ap.add_argument("--grade-only", action="store_true", help="nur die vorhandenen Nachtbilder abdunkeln (ohne InvokeAI)")
    ap.add_argument("--contact", help="Pfad für den Kontaktbogen (JPEG), 3 Spalten je Szene")
    a = ap.parse_args()

    if a.grade_only:
        for scene in SCENES:
            path = os.path.join(a.out, f"{scene}-night.webp")
            if os.path.exists(path):
                save(grade_night(Image.open(path).convert("RGB")), path)
        return

    try:
        requests.get(f"{API}/app/version", timeout=3).raise_for_status()
    except requests.RequestException:
        sys.exit("InvokeAI läuft nicht: ~/.local/bin/invokeai-launch.sh (Kaltstart ~8-10 Min)")

    g = template()
    os.makedirs(a.out, exist_ok=True)
    only = set(a.only.split(",")) if a.only else None
    phases = set(a.phases.split(","))
    imgs, labels = [], []
    for i, (scene, text) in enumerate(SCENES.items()):
        row = {}
        for phase in ("day", "twilight", "night"):
            path = os.path.join(a.out, f"{scene}-{phase}.webp")
            if (only and scene not in only) or (phase not in phases and os.path.exists(path)):
                row[phase] = Image.open(path).convert("RGB") if os.path.exists(path) else None
                continue
            seed = a.seed + i
            if phase == "day":
                im = run(text2img(g), text + SKY, seed)
            else:
                if phase == "twilight":
                    prompt, strength = text + TWILIGHT + SKY, STRENGTH["twilight"]
                elif scene in STARRY:
                    prompt, strength = text + NIGHT_STARS + SKY, STRENGTH["night-stars"]
                else:
                    prompt, strength = text + NIGHT_CLOUDS + SKY, STRENGTH["night"]
                im = run(img2img(g, upload(row["day"]), strength), prompt, seed)
            if phase == "night":
                im = grade_night(im)
            row[phase] = im
            save(im, path)
        for phase in ("day", "twilight", "night"):
            if row[phase] is not None:
                imgs.append(row[phase])
                labels.append(f"{scene}-{phase}")
    if a.contact:
        contact_sheet(imgs, labels, 3, a.contact)
        print(a.contact)


if __name__ == "__main__":
    main()
