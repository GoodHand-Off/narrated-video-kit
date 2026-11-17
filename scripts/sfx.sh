#!/bin/sh
# Rebuilds the sound effects in public/sfx from plain tones, so there is nothing to license.
# Needs a system ffmpeg (the one bundled with Remotion has no tone generator).
set -e
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Error: npm run sfx needs ffmpeg on your PATH (the one bundled with Remotion has no tone generator)." >&2
  echo "Install it with \`brew install ffmpeg\` (macOS) or \`sudo apt install ffmpeg\` (Debian, Ubuntu). The generated files are already in public/sfx." >&2
  exit 1
fi
cd "$(dirname "$0")/../public/sfx"
F="ffmpeg -y -loglevel error"
# Key tap
$F -f lavfi -i "aevalsrc='0.35*(random(0)*2-1)*exp(-180*t)':s=48000:d=0.04" -af "highpass=f=1800" tap.wav
# Message ding (two bright tones)
$F -f lavfi -i "aevalsrc='0.22*sin(2*PI*1568*t)*exp(-7*t)+0.2*sin(2*PI*2093*(t-0.09))*exp(-7*(t-0.09))*gte(t,0.09)':s=48000:d=0.7" ding.wav
# Phone buzz (two short pulses)
$F -f lavfi -i "aevalsrc='0.5*sin(2*PI*150*t)*sin(2*PI*31*t)*lt(mod(t,0.4),0.25)':s=48000:d=0.65" -af "lowpass=f=400" buzz.wav
# Ringtone (three-note figure, twice)
$F -f lavfi -i "aevalsrc='0.28*(sin(2*PI*1319*t)*exp(-9*mod(t,1.2))*lt(mod(t,1.2),0.15)+sin(2*PI*1568*t)*exp(-9*(mod(t,1.2)-0.15))*gte(mod(t,1.2),0.15)*lt(mod(t,1.2),0.3)+sin(2*PI*1976*t)*exp(-6*(mod(t,1.2)-0.3))*gte(mod(t,1.2),0.3)*lt(mod(t,1.2),0.75))':s=48000:d=2.4" ring.wav
# Call connects
$F -f lavfi -i "aevalsrc='0.2*sin(2*PI*880*t)*lt(t,0.09)+0.2*sin(2*PI*1320*t)*gte(t,0.11)*lt(t,0.22)':s=48000:d=0.25" connect.wav
# Rubber stamp thump
$F -f lavfi -i "aevalsrc='0.9*sin(2*PI*68*t)*exp(-13*t)+0.3*(random(0)*2-1)*exp(-45*t)':s=48000:d=0.4" -af "lowpass=f=2500" stamp.wav
echo "public/sfx: tap, ding, buzz, ring, connect, stamp"
