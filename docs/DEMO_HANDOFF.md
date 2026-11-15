# Demo video handoff

The demo is already animated and rendered. You do not need to film or screen-record anything.
Your job: put the real names on it, check it, upload it, and send back the link.

**Deadline:** link back by Sunday 15 November, 8:00 PM Dhaka. Submission closes 11:59 PM.

## What you are getting
- `demo/burncalendar-demo.mp4`: 1920×1080, 30 fps, 29.5 seconds, with sound effects, about 15 MB.
- `demo/index.html`: the animation. `demo/render.mjs` turns it into the MP4.
- `demo/shots/`: real screenshots of the live site used in two scenes (made by `demo/capture.mjs`).
- `demo/sfx/`: 22 sound effects from SFX Kit by Wyzowl (github.com/wyzowl/sfx-kit), CC0, free for any use. `demo/sfx.py` mixes them into `demo/sfx.wav`, placing each on its moment with the kit's own timing data.

The current MP4 already shows "Team One Scale" and the three member names. Skip step 1 unless a name is misspelled.

## Step 1. Put the names on it (2 minutes)
Needs Node.js, ffmpeg, and Chrome, Brave or Edge. From the project folder:

```bash
cd demo && npm install
```

```bash
node render.mjs --team "One Scale" --members "Mostafa Tahmeed Foysal, Nahin Eftekhar, Prantik Biswas"
```

It prints progress and writes `demo/burncalendar-demo.mp4` in about a minute.
To look before rendering, run `node render.mjs --still 1.8` and open `demo/still-1.8.png`.

If you cannot run it, send the names to Planck and ask for a new file. Do not add names in a video editor
unless the result stays at or under 30 seconds.

## Step 2. Check it
- [ ] Length is **under 30 seconds**. Over 30 makes the project ineligible. Do not add an intro, outro or logo.
- [ ] Team name and every member's name are spelled right on the first screen.
- [ ] All text is readable on a phone.
- [ ] Nothing was added that shows or records a person under 18.
- [ ] No NASA logo, and no music you do not have the right to use.

## Step 3. Sound
There are two files: `burncalendar-demo.mp4` has sound effects (soft whooshes on scene changes, a riser into the
name, count-up ticks on the numbers, a mouse click, and a short marimba sting at the start and end);
`burncalendar-demo-silent.mp4` has none. Planck has listened to the version with sound and approved it, so **upload `burncalendar-demo.mp4`**.
The silent file is only a fallback.

Every line is on screen in English, so it needs no subtitles. If you add music or a voice on top:
- Music must be licensed for reuse (for example the YouTube Audio Library). Send Planck the track name,
  artist and link. It has to be listed in the references on the project page.
- A voice in Bangla is allowed, since the on-screen text is English. Keep the video at 29.5 seconds.
- Only people aged 18 or over may be heard.

## Step 4. Upload
- YouTube: visibility **Unlisted** or **Public** (not Private), "not made for kids".
  Title: `BurnCalendar: NASA Space Apps 2026 demo`.
- Or Google Drive: share as "Anyone with the link, Viewer".
- Open the link in a private browser window, signed out. It must play with no login or permission request.

## Step 5. Send back
- The link.
- The exact team name and member names you used.
- Music credit, if any.

## What is in the video
| Time | Screen |
|---|---|
| 0:00 | Team name, members, the challenge |
| 0:03 | The problem: VIIRS sees about three times as much fire as MODIS, so the joined record jumps in 2012 |
| 0:07 | BurnCalendar: 26 years of fire across six countries, played month by month |
| 0:12 | Raw records say fire is rising in 74 of 99 states. On one scale it is 18 |
| 0:17 | The real site in a browser frame: New South Wales, zoom to the calendar, click December 2019 |
| 0:21 | Tested on unseen years: 11.0% error against 77.8%. Early warning 3.7 times better than chance |
| 0:24 | The real site again: the early-warning table |
| 0:26 | Ready as MODIS retires, with the site address |

Every number comes from the project's own data files and matches the README.

## If you want to change wording
Text is plain HTML near the top of `demo/index.html`. Timings are the `data-in` values, in seconds.
Change, re-render, re-check the length. If you move a timing, move the matching `cue(...)` line in `demo/sfx.py` and run
`python demo/sfx.py demo/sfx.wav` (needs NumPy) before rendering. To drop one sound, delete its line. If the site changes, `node demo/capture.mjs`
retakes the screenshots.
