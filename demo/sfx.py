"""Mix the demo's soundtrack from SFX Kit sounds.

Usage: python -I demo/sfx.py demo/sfx.wav

Sounds: SFX Kit by Wyzowl, https://github.com/wyzowl/sfx-kit, CC0 1.0 (files and their data in demo/sfx/).
Nothing is synthesized here. Each sound is placed by the kit's rule: start = moment - sync point / rate.
The moments mirror demo/index.html; change both together.
"""
import sys
import json
import wave
import pathlib
import numpy as np

SR, DUR = 48000, 29.5
HERE = pathlib.Path(__file__).parent / "sfx"
META = json.load(open(HERE / "sounds.json"))["sounds"]
out = np.zeros((int(SR * DUR), 2))


def load(name):
    with wave.open(str(HERE / f"{name}.wav")) as w:
        assert w.getframerate() == SR and w.getsampwidth() == 3
        b = np.frombuffer(w.readframes(w.getnframes()), np.uint8).reshape(-1, 3).astype(np.int32)
        x = (b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16))
        x = np.where(x >= 1 << 23, x - (1 << 24), x) / float(1 << 23)
        x = x.reshape(-1, w.getnchannels())
    return np.repeat(x, 2, axis=1) if x.shape[1] == 1 else x


def cue(moment, name, db=0.0, rate=1.0):
    """Place a sound so its sync point meets `moment` (seconds). rate changes speed and pitch, within the kit's limits."""
    m = META[name]
    lo, hi = m["adapt"]["rate"]
    assert lo <= rate <= hi, (name, rate, lo, hi)
    x = load(name)
    if rate != 1.0:
        pos = np.arange(int(len(x) / rate)) * rate
        x = np.stack([np.interp(pos, np.arange(len(x)), x[:, c]) for c in range(2)], axis=1)
    start = moment - m["sync"]["at"] / rate
    i = int(round(start * SR))
    if i < 0:                                   # starts before 0: trim the beginning with a short fade
        x = x[-i:].copy(); x[: int(.02 * SR)] *= np.linspace(0, 1, int(.02 * SR))[:, None]; i = 0
    x = x[: len(out) - i]
    out[i:i + len(x)] += x * 10 ** (db / 20)
    print(f"{start:6.2f}s  {name:24s} {db:+.0f} dB  rate {rate:.2f}  meets {moment:.2f}s ({m['sync']['meets']})")


# 1. title card: names settle at about 0.85 s
cue(0.85, "sting-minimal-long")
# scene changes
cue(2.60, "whoosh-slow-soft", -2)
cue(12.00, "whoosh-slow-soft", -2)
cue(16.85, "whoosh-slow-soft", -2)
cue(21.40, "whoosh-medium-soft", -2)
cue(23.80, "whoosh-medium-soft", -2)
# 2. the record breaks in 2012
cue(3.00, "data-chart-reveal", -2, .85)        # MODIS line draws
cue(4.05, "boom-hit-soft", +3)                 # the jump
cue(4.05, "data-countup-short", 0, .85)        # x1.0 -> x2.9
cue(4.95, "data-number-land", -2)
# 3. BurnCalendar: a riser into the wordmark, then the 26-year timelapse builds to today
cue(7.05, "riser-2s-soft", -1)
cue(7.05, "boom-hit-medium", +2)
cue(7.05, "shimmer-medium-bright", -4)
cue(11.50, "riser-4s-soft", -6, 1.04)
cue(11.50, "tone-ding-mid", -3)
# 4. 74 states, then 18
cue(12.30, "data-countup-short", 0, .85)
cue(13.20, "data-number-land", -2)
cue(14.30, "transform-morph", -1, .86)         # the dots change colour
cue(14.30, "data-decrease-short", -1, .85)
cue(15.20, "data-number-land", 0)
# 5. the real site: zoom, click, callout
cue(18.45, "whoosh-slow-soft", -4)             # camera push, fastest at its middle
cue(19.30, "click-mouse-medium", +5)
cue(19.50, "pop-medium-in", -2)
cue(19.52, "shimmer-short-soft", -1)
# 6. proof: three bars, then the 3.7x count
cue(22.15, "tone-step-1")
cue(22.30, "tone-step-2")
cue(22.45, "tone-step-3")
cue(22.70, "data-countup-short", 0, .85)
cue(23.45, "data-number-land", -1)
# 7. close: the last line, then the address
cue(26.45, "sting-warm-long", +1)
cue(27.45, "pop-small-in", -3)

t = np.arange(len(out)) / SR
out *= np.clip((DUR - t) / .6, 0, 1)[:, None]
peak = np.abs(out).max()
gain = min(10 ** (4 / 20), 10 ** (-2 / 20) / peak)          # lift the whole mix a little, but never past -2 dB peak
out *= gain
print(f"mix peak before gain {20 * np.log10(peak):.1f} dBFS, master gain {20 * np.log10(gain):+.1f} dB, final peak {20 * np.log10(np.abs(out).max()):.1f} dBFS")
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(np.round(out * 32767).astype("<i2").tobytes())
