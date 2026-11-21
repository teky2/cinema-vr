# Cinema VR

Paste a link, watch it in stereo. Local 360 files render on a real sphere.

## Build the zip
`bash cinema-vr/build.sh` → `cinema-vr.zip`

## Deploy to Render
1. Push this folder to a Git repo.
2. Render → New → Blueprint → select the repo → Apply.
3. Both services provision from `render.yaml`.

Requires HTTPS: gyro, fullscreen and service workers are secure-context only.

## Proxy
`cinema-vr-proxy` moves Hotstar out of the frame so its framing headers stop
applying. Tap **Proxy** in the app to point at it. Free plan sleeps after 15
minutes idle; first hit after that is slow.