#!/usr/bin/env bash
# Copies generated launcher icons into the Capacitor Android project and removes the default adaptive icon.
set -e
npx tauri icon assets/icon.svg --output /tmp/cadlite-icons >/dev/null
RES=android/app/src/main/res
for d in /tmp/cadlite-icons/android/mipmap-*; do
  n=$(basename "$d"); [ "$n" = "mipmap-anydpi-v26" ] && continue
  cp "$d/ic_launcher.png" "$RES/$n/ic_launcher.png"; cp "$d/ic_launcher_round.png" "$RES/$n/ic_launcher_round.png"
done
rm -rf "$RES/mipmap-anydpi-v26"
