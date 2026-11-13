#!/bin/bash
# Baut die Dartzähler-APK ohne Gradle (nur SDK-Build-Tools + JDK).
# Aufruf auf dem Host:  bash build.sh   ->  out/Dartzaehler.apk
set -euo pipefail
cd "$(dirname "$0")"

SDK="$(cd ../Android-SDK && pwd)"
BT="$SDK/bt/android-16"           # build-tools 36.1
JAR="$SDK/pf/android-36/android.jar"
KS="signing/dartzaehler.keystore" # NICHT löschen – sonst sind Updates nicht installierbar
PASS="dartzaehler"

rm -rf build out && mkdir -p build/res build/gen build/classes out signing

echo "[1/6] Ressourcen kompilieren"
"$BT/aapt2" compile --dir res -o build/res.zip

echo "[2/6] Linken"
"$BT/aapt2" link -o build/base.apk -I "$JAR" --manifest AndroidManifest.xml \
  -A assets --java build/gen --min-sdk-version 26 --target-sdk-version 34 \
  -R build/res.zip --auto-add-overlay

echo "[3/6] Java kompilieren"
javac -nowarn -Xlint:-options -source 11 -target 11 -encoding UTF-8 -classpath "$JAR" \
  -d build/classes $(find src build/gen -name '*.java')

echo "[4/6] Dex"
"$BT/d8" --release --min-api 26 --lib "$JAR" --output build $(find build/classes -name '*.class')

echo "[5/6] Packen + ausrichten"
cp build/base.apk build/unaligned.apk
(cd build && zip -q -j unaligned.apk classes.dex)
"$BT/zipalign" -f -p 4 build/unaligned.apk build/aligned.apk

echo "[6/6] Signieren"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass "$PASS" -keypass "$PASS" -alias dart \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Dartzaehler" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:"$PASS" --ks-key-alias dart \
  --out out/Dartzaehler.apk build/aligned.apk
"$BT/apksigner" verify out/Dartzaehler.apk
ls -la out/Dartzaehler.apk
