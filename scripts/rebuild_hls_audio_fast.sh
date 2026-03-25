#!/usr/bin/env bash
set -euo pipefail

SRC="/home/shynwo/streamnest/Test-movie/attack-on-titan-trailer.mp4"
DST="/home/shynwo/streamnest/Test-movie/hls/attack-on-titan-trailer"
TMP="${DST}.tmp"
LOG="/home/shynwo/streamnest/Test-movie/hls/rebuild_hls_audio_fast.log"

mkdir -p "$(dirname "$LOG")"
echo "[INFO] $(date -Iseconds) start rebuild FAST" >> "$LOG"

rm -rf "$TMP"
mkdir -p "$TMP/v0" "$TMP/v1"

ffmpeg -y -hide_banner -i "$SRC" \
  -filter_complex "[0:v]split=2[v0][v1];[v1]scale=w=854:h=480:flags=fast_bilinear[v1out]" \
  -map "[v0]" -map 0:a:0 -map "[v1out]" -map 0:a:0 \
  -c:v libx264 -preset ultrafast -profile:v high -pix_fmt yuv420p \
  -g 96 -keyint_min 96 -sc_threshold 0 \
  -b:v:0 3200k -maxrate:v:0 3800k -bufsize:v:0 6400k \
  -b:v:1 1500k -maxrate:v:1 2000k -bufsize:v:1 3000k \
  -c:a aac -ar 48000 -ac 2 \
  -b:a:0 160k -b:a:1 128k \
  -hls_time 4 -hls_playlist_type vod -hls_flags independent_segments \
  -master_pl_name master.m3u8 \
  -hls_segment_filename "$TMP/v%v/seg_%03d.ts" \
  -var_stream_map "v:0,a:0 v:1,a:1" \
  "$TMP/v%v/prog.m3u8" >> "$LOG" 2>&1

ffprobe -v error -show_streams "$TMP/v0/seg_000.ts" | grep -q "codec_type=audio"
ffprobe -v error -show_streams "$TMP/v1/seg_000.ts" | grep -q "codec_type=audio"

rm -rf "${DST}.bak"
if [ -d "$DST" ]; then
  mv "$DST" "${DST}.bak"
fi
mv "$TMP" "$DST"

echo "[INFO] $(date -Iseconds) rebuild done" >> "$LOG"
