"""Draws the walkthrough's frames from the stills and the camera path in manifest.json.

  python3 frames.py <work dir> keys     one finished frame per scene (key-N.jpg), as it will look in the video
  python3 frames.py <work dir> at N SEC OUT.jpg   one frame of scene N, for checking
  python3 frames.py <work dir> render [1,2,8]   one encoded file per scene (crossfades inside); with a list, only those scenes

Each still is 2560x1440 for a 1280x720 page. A frame is the camera's 16:9 part of it, scaled to 1280x720,
with the scene's caption band on top.
"""
import json, os, subprocess, sys
from PIL import Image

OUT, MODE = sys.argv[1], sys.argv[2]
W, H, FPS, FADE, END_SECONDS = 1280, 720, 30, 0.4, 5
FFMPEG = "/usr/local/bin/ffmpeg"
ENC = ["-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", str(FPS), "-an"]
manifest = json.load(open(os.path.join(OUT, "manifest.json")))
scenes = manifest["scenes"]
caption = lambda i: Image.open(os.path.join(OUT, f"caption-{i + 1}.png")).convert("RGBA")
ease = lambda t: 2 * t * t if t < 0.5 else 1 - 2 * (1 - t) * (1 - t)


def view(still, crop, cap):
    k = still.width / W
    x, y, w = crop["x"] * k, crop["y"] * k, crop["w"] * k
    frame = still.resize((W, H), Image.LANCZOS, box=(x, y, x + w, y + w * H / W))
    if cap is not None:
        frame.paste(cap, (0, 0), cap)
    return frame


def scene_frames(i):
    """Every frame of scene i, as bytes; a repeated frame is the same object."""
    cap = caption(i)
    for item in scenes[i]["items"]:
        still = Image.open(item["file"]).convert("RGB")
        c0, c1, n = item["c0"], item["c1"], item["frames"]
        if c0 == c1:
            data = view(still, c0, cap)
            for _ in range(n):
                yield item, data
        else:
            for f in range(1, n + 1):
                t = ease(f / n)
                yield item, view(still, {a: c0[a] + (c1[a] - c0[a]) * t for a in "xyw"}, cap)


def last_frame(i):
    item = scenes[i]["items"][-1]
    return view(Image.open(item["file"]).convert("RGB"), item["c1"], caption(i))


def encode(name, frames):
    tmp, done = os.path.join(OUT, f"{name}.part.mp4"), os.path.join(OUT, f"{name}.mp4")
    p = subprocess.Popen([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-framerate", str(FPS), "-i", "pipe:0", *ENC, tmp], stdin=subprocess.PIPE)
    cache = (None, None)
    for frame in frames:
        if cache[0] is not frame:
            cache = (frame, frame.tobytes())
        p.stdin.write(cache[1])
    p.stdin.close()
    if p.wait() != 0:
        raise SystemExit(f"{name}: ffmpeg exited {p.returncode}")
    os.rename(tmp, done)
    return done


def faded(frames, prev):
    """Crossfades: from the previous scene's last frame at the start, and over any still marked as a cut."""
    n = round(FADE * FPS)
    left, before = n if prev is not None else 0, prev
    last_item = None
    for item, frame in frames:
        if item is not last_item and item.get("fade") and before is not None:
            left, prev = n, before
        last_item = item
        if left:
            out = Image.blend(prev, frame, 1 - (left - 1) / n) if left > 1 else frame
            left -= 1
        else:
            out = frame
        before = frame
        yield out


if MODE == "keys":
    for i, sc in enumerate(scenes):
        view(Image.open(sc["key"]["file"]).convert("RGB"), sc["key"]["crop"], caption(i)).save(os.path.join(OUT, f"key-{i + 1}.jpg"), quality=93)
    print("keys done")

if MODE == "at":  # frames.py <dir> at <scene number> <seconds> <out.jpg>: one frame, for checking
    i, sec, out = int(sys.argv[3]) - 1, float(sys.argv[4]), sys.argv[5]
    for n, frame in enumerate(faded(scene_frames(i), last_frame(i - 1) if i else None)):
        if n >= round(sec * FPS):
            frame.save(out, quality=93)
            break

if MODE == "render":
    # With a list of scene numbers (render 1,2,8), only those are drawn; the other scene files must exist.
    only = {int(x) for x in sys.argv[3].split(",")} if len(sys.argv) > 3 else None
    files = []
    for i, sc in enumerate(scenes):
        if only is None or i + 1 in only:
            encode(f"scene-{i + 1}", faded(scene_frames(i), last_frame(i - 1) if i else None))
            print(sc["name"], "drawn", flush=True)
        files.append(os.path.join(OUT, f"scene-{i + 1}.mp4"))
    # End card: no caption band, fading in from the last scene.
    n = len(scenes) + 1
    if only is None or n in only:
        end = Image.open(os.path.join(OUT, "endcard.jpg")).convert("RGB")
        encode(f"scene-{n}", faded((({}, end) for _ in range(END_SECONDS * FPS)), last_frame(len(scenes) - 1)))
    files.append(os.path.join(OUT, f"scene-{n}.mp4"))
    missing = [f for f in files if not os.path.exists(f)]
    if missing:
        raise SystemExit(f"not drawn yet: {missing}")
    with open(os.path.join(OUT, "scenes.txt"), "w") as f:
        f.write("".join(f"file '{x}'\n" for x in files))
    print("\n".join(files))
