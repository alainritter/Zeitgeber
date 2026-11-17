#!/usr/bin/env python3
"""Wetterhimmel-Bilder (public/weather/*.webp) per Krea-2 Turbo (InvokeAI-API) erzeugen.

Nur für Maintainer: Die fertigen Bilder liegen im Repo, Nutzer brauchen InvokeAI nicht.

    # 1. Kandidaten für das Basisbild (klar, Tag) würfeln + Kontaktbogen ansehen
    python3 scripts/weather-images.py base --seeds 11,23,42 --out /tmp/wx

    # 2. Gewähltes Basisbild in alle 21 Szenen x Lichtphasen überführen (img2img)
    python3 scripts/weather-images.py variants --base /tmp/wx/base-23.png --seed 7 \
        --out public/weather --contact /tmp/wx/contact.jpg

Alle Varianten entstehen aus demselben Basisbild per img2img, damit die Komposition
gleich bleibt und sich Tag, Dämmerung und Nacht sauber überblenden lassen.

Als Graph-Vorlage dient das neueste Krea-2-img2img-PNG aus dem InvokeAI-Output-Ordner
(PNG-Chunk `invokeai_graph`, enthält den Node `i2l`). InvokeAI muss laufen
(~/.local/bin/invokeai-launch.sh, Kaltstart ~8-10 Min).
"""
import argparse, glob, io, json, os, sys, time
import requests
from PIL import Image, ImageDraw

API = "http://localhost:9090/api/v1"
OUTPUTS = "/home/a/invokeai/outputs/images"
W, H = 1024, 576

SCENE = (
    " Wide landscape photograph, meadow with a footpath in the foreground, calm lake in the middle"
    " distance, gentle hills on the horizon with a small anonymous village, no recognizable"
    " landmarks, photorealistic, 35mm, natural light, no text, no people, no animals."
)
# Wetter-Satz je Szene und img2img-Stärke (Anteil, der neu gewürfelt wird).
WEATHER = {
    "clear": ("clear blue sky with a few thin high clouds", 0.0),
    "partly": ("partly cloudy sky with scattered white cumulus clouds", 0.45),
    "overcast": ("fully overcast sky, flat grey cloud layer, muted light", 0.55),
    "fog": ("dense low fog over the lake and meadow, hills barely visible, soft diffuse light", 0.65),
    "rain": ("steady rain under grey clouds, wet footpath with puddles, misty hills", 0.6),
    "snow": ("snowfall, snow-covered meadow and footpath, frozen lake edge, falling snowflakes", 0.75),
    "storm": ("violent thunderstorm, dark towering clouds, strong wind bending the grass", 0.65),
}
PHASE = {
    "day": ("midday daylight", 0.0),
    "twilight": ("dusk twilight shortly after sunset, deep blue sky, warm glow on the horizon,"
                 " a few small warm lit windows in the village", 0.05),
    "night": ("deep night, moonlight, dark blue tones, a few small warm lit windows in the village", 0.1),
}


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


def upload(path):
    with open(path, "rb") as fh:
        r = requests.post(
            f"{API}/images/upload",
            params={"image_category": "general", "is_intermediate": "true"},
            files={"file": (os.path.basename(path), fh, "image/png")},
        )
    r.raise_for_status()
    return r.json()["image_name"]


def prompt_for(scene, phase):
    return f"{WEATHER[scene][0]}, {PHASE[phase][0]}.{SCENE}"


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


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("base")
    b.add_argument("--seeds", default="11,23,42")
    b.add_argument("--out", required=True)
    v = sub.add_parser("variants")
    v.add_argument("--base", required=True, help="gewähltes Basisbild (PNG)")
    v.add_argument("--seed", type=int, default=7)
    v.add_argument("--out", required=True)
    v.add_argument("--contact", help="Pfad für den Kontaktbogen (JPEG)")
    v.add_argument("--only", help="nur diese Szenen, kommagetrennt (zum Nachwürfeln)")
    a = ap.parse_args()

    try:
        requests.get(f"{API}/app/version", timeout=3).raise_for_status()
    except requests.RequestException:
        sys.exit("InvokeAI läuft nicht: ~/.local/bin/invokeai-launch.sh (Kaltstart ~8-10 Min)")

    g = template()
    os.makedirs(a.out, exist_ok=True)

    if a.cmd == "base":
        seeds = [int(s) for s in a.seeds.split(",")]
        imgs = []
        for s in seeds:
            im = run(text2img(g), prompt_for("clear", "day"), s)
            p = os.path.join(a.out, f"base-{s}.png")
            im.save(p)
            imgs.append(im)
            print(p)
        contact_sheet(imgs, [f"seed {s}" for s in seeds], len(imgs), os.path.join(a.out, "contact-base.jpg"))
        print(os.path.join(a.out, "contact-base.jpg"))
        return

    base_name = upload(a.base)
    base_img = Image.open(a.base).convert("RGB")
    only = set(a.only.split(",")) if a.only else None
    imgs, labels = [], []
    for scene in WEATHER:
        for phase in PHASE:
            key = f"{scene}-{phase}"
            if scene == "clear" and phase == "day":
                im = base_img  # das Basisbild selbst
            elif only and scene not in only:
                path = os.path.join(a.out, f"{key}.webp")
                im = Image.open(path).convert("RGB") if os.path.exists(path) else None
                if im is None:
                    continue
            else:
                strength = min(0.95, WEATHER[scene][1] + PHASE[phase][1])
                if scene == "clear":
                    strength = max(strength, 0.5)  # klarer Himmel braucht für Dämmerung/Nacht genug Spielraum
                im = run(img2img(g, base_name, strength), prompt_for(scene, phase), a.seed)
            if im.size != (W, H):
                im = im.resize((W, H))
            path = os.path.join(a.out, f"{key}.webp")
            im.save(path, "WEBP", quality=80)
            print(f"{path} ({os.path.getsize(path) // 1024} KB)")
            imgs.append(im)
            labels.append(key)
    if a.contact:
        contact_sheet(imgs, labels, 3, a.contact)
        print(a.contact)


if __name__ == "__main__":
    main()
