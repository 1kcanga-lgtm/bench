# Bench -- self-hosted on Portainer

(This is the Card Ledger app, running under the name "Bench" -- the stack, container, and page
title all use that name below.)

Everything in this folder packages up your Card Ledger app to run as its own little web server
on your Portainer machine, instead of inside the sandbox it was originally built in. Your
collection data moves to a real database file that lives in a Docker volume, so it survives
restarts and updates.

## What's in here

- `Dockerfile` -- builds the container image.
- `docker-compose.yml` -- the Portainer "stack" file.
- `server.js` -- a small backend: it serves the app and stores your data in SQLite, and (if you
  give it a key) forwards the AI identify/appraise calls to Anthropic so your key never sits in
  the browser.
- `public/` -- the built app (already compiled, nothing to build yourself).
- `src/` -- the original app source, kept here in case you (or a future Claude session) want to
  make changes and rebuild.
- `package.json` -- lists what `npm install` needs.

## About the Anthropic API key (optional, but powers the AI features)

Two features in the app -- **card identification** (scan a card, get player/team/year/set
filled in automatically) and **Appraise** (rough value estimates) -- work by asking Claude
(Anthropic's AI) to look at the photo. That only works if the server has a real API key to make
those requests with. Without one, the app still runs completely fine as a manual ledger --
you can add, edit, browse, and check cards off the checklist by hand -- it just won't auto-fill
anything from a photo.

**If you want those features:**

1. Go to **console.anthropic.com** and sign up (separate from a normal claude.ai subscription --
   this is the pay-as-you-go developer side, billed by usage rather than a monthly plan).
2. Under **Billing**, add a small amount of credit -- $5 or $10 is plenty to start.
3. Under **API Keys**, create a new key (looks like `sk-ant-...`). Copy it somewhere safe --
   you won't be able to see it again after this.
4. That key goes into the `ANTHROPIC_API_KEY` environment variable in the Portainer stack setup
   below (Step 3). It's read by the server only -- it's never sent to your browser.

**What it costs:** there's no subscription fee, just pay-per-use. Each card scanned or appraised
costs a small fraction of a cent to a few cents, depending on the model and photo size -- for a
personal collection, a full session of scanning is unlikely to add up to much. Anthropic's
current published rates are at platform.claude.com/docs/en/about-claude/pricing if you want the
exact numbers. You can set a monthly spend limit in the console's Billing settings as a safety
net.

You can skip this entirely for now and add the key later -- just edit the environment variable
in the stack and redeploy (Step 5 below covers updating a running stack).

## Step 1 -- Build the image in Portainer

1. Download the file `card-ledger.tar.gz` (sent alongside this file) -- it's this whole folder,
   packaged up.
2. In Portainer, go to **Images** in the left sidebar, then **Build a new image**.
3. Choose the **Upload** method and select `card-ledger.tar.gz`.
4. Name the image `card-ledger:latest` (the tag matters -- the stack file below expects exactly
   this name).
5. Click **Build the image** and wait for it to finish (a minute or two).

*(If your Portainer's build UI looks different or doesn't accept a `.tar.gz` this way -- Portainer's
exact wording shifts between versions -- the fallback is to unzip the folder somewhere your
Portainer host can reach and run `docker build -t card-ledger:latest .` from a terminal on that
machine, then continue at Step 2 below either way.)*

## Step 2 -- Create the stack

1. Go to **Stacks** -> **Add stack**.
2. Name it `bench`.
3. Choose **Web editor** and paste in the contents of `docker-compose.yml` (included here).
4. Scroll to **Environment variables** and add `ANTHROPIC_API_KEY` with your key from above --
   or leave it out entirely to run without AI features for now.
5. Click **Deploy the stack**.

**If deploy fails with "port is already allocated"**: something else on your server is already
using that port. The compose file defaults to `8091` on the host side specifically to avoid the
very common `8080`, but if `8091` is also taken, add another environment variable in that same
Portainer screen -- `HOST_PORT` set to any free port (e.g. `8092`) -- and deploy again. No need
to edit the YAML itself.

## Step 3 -- Open it

Once deployed, visit `http://<your-portainer-server-ip>:8091` in a browser (or whatever port you
set `HOST_PORT` to). That's Bench, running on your own hardware.

**One thing to know about the "watch a scan folder" feature**: browsers only allow that
particular feature (picking a folder for the app to watch) on a page loaded over HTTPS, or on
`localhost` -- a plain `http://<ip>:8080` address won't offer it (it'll just quietly not show
that option, not break anything else). If you want that feature specifically, the page needs to
be served over HTTPS -- a reverse proxy in front of this container (e.g. Nginx Proxy Manager,
Traefik, or Caddy, all common companions to Portainer) with a free Let's Encrypt certificate is
the usual way to do that. Ask me anytime if you want help setting one up.

## Faster updates (set up once, skip the image rebuild forever after)

The `Dockerfile`/image-rebuild flow above is the safe, no-assumptions way to get this running the
first time. Once it's up, there's a much lighter way to push updates, since you have SSH access
to the server: mount `public/` and `server.js` from a folder on the server's own disk instead of
baking them into the image. After this one-time change, updating the app is just "overwrite a
file over SSH" -- no image rebuild, no Recreate, most of the time not even a restart.

**One-time setup**, over SSH on the Portainer server:

```
mkdir -p /opt/bench-app
```

(pick any path you like -- if you use something other than `/opt/bench-app`, add an `APP_DIR`
environment variable in the stack with your path instead, same as `HOST_PORT`.)

Then copy this package's `public/` folder and `server.js` file into that directory -- e.g. unzip
`bench-selfhost.tar.gz` somewhere on your own computer and `scp` those two into place:

```
scp -r public server.js youruser@your-server:/opt/bench-app/
```

Update the stack in Portainer with the current `docker-compose.yml` (it now mounts that folder)
and deploy once more. This is the last time you'll need to touch Portainer's Images or
Containers pages for an ordinary app update.

**From then on, whenever I (Claude) hand you an updated `app.bundle.js` or `server.js`:**

- Frontend-only change (`app.bundle.js`, `index.html`, the shim files): `scp` the new file over
  the old one in `/opt/bench-app/public/`. That's it -- refresh the page in your browser. The
  server reads static files fresh off disk on every request, so nothing needs restarting.
- Backend change (`server.js`): `scp` it into `/opt/bench-app/`, then `docker restart bench` over
  SSH (or hit **Restart** on the container in Portainer). A few seconds, no rebuild.

The only time you'd go back to a full image rebuild is if a change ever needs a genuinely new
dependency (a new npm package beyond Express/SQLite) -- which should be rare for an app this
size.

## Bulk Auto-Import (scan thousands of cards with no per-card review)

A new "Auto Import" tab lets the server identify, orient, and save a whole folder of cards on
its own, with no review screen -- except for the minority the AI genuinely isn't confident
about, which land in a small review queue instead of being saved or guessed. It runs through
Anthropic's official **Batch API**, which processes requests asynchronously at a flat 50%
discount off normal pricing in exchange for taking up to a few hours instead of being instant --
closing the browser tab doesn't stop it, since the whole thing runs on the server, not in your
tab.

**How to organize your scans**: one subfolder per physical card, each containing that card's
front and back photo (e.g. `card-001/front.jpg` + `card-001/back.jpg`), works best. That said, the
Auto Import tab also understands a flat folder of sequentially-scanned front/back pairs (its
own subfolders too, at any depth) -- so folders organized by team, box, or however you already
have them work fine without reorganizing anything first; it just pairs each folder's images up in
scan order, splitting a folder with more than two images into consecutive front/back pairs.

**Getting your scans in -- no `scp` needed**: the "Choose a folder to upload" button on the Auto
Import tab uploads a folder (or a folder of folders) straight from your computer's browser, the
same way the Bulk Add tab's folder picker always has -- pick your scans folder, watch the
progress bar until it finishes, then close the tab whenever you like; the identifying and saving
happens on the server afterward. There's no need to get your scans onto the Portainer server
yourself for this.

If you'd rather point the server at a folder that's already sitting on it (or mounted into it) --
e.g. a NAS share, or scans copied over some other way -- there's a "Already copied scans onto the
server yourself?" option on the same tab for that: by default it looks under `/opt/bench-import`
on the server (mapped to `/data/import` inside the container); set an `IMPORT_DIR` stack
environment variable if you'd rather use a different path, same idea as `APP_DIR`/`HOST_PORT`. The
folder name you type there is *relative* to that root -- e.g. if you copied cards into
`/opt/bench-import/box-1/`, type `box-1`.

**This update needs the full rebuild path, not the usual fast-update `scp`**: it adds a new
backend dependency (`sharp`, for server-side image resizing -- there was no image-processing
library on the server before this) which only gets installed during `npm install` at image-build
time, and a new bind-mounted folder (`IMPORT_DIR`) that has to be added to the running stack. So
this one time:

1. Rebuild the image (Step 1 at the top of this doc) from the updated package -- this pulls in
   `sharp` via `npm install`.
2. `mkdir -p /opt/bench-import` on the server (or your own chosen `IMPORT_DIR` path).
3. Copy the updated `bulk-import.js` into your `APP_DIR` folder (`/opt/bench-app/` by default)
   alongside `server.js` and `public/` -- it's bind-mounted the same way those already are.
4. Update the stack in Portainer with the new `docker-compose.yml` (it adds the `bulk-import.js`
   mount, the `IMPORT_DIR` mount, and the `IMPORT_ROOT` environment variable) and redeploy/recreate.

After that, ordinary future updates to `bulk-import.js` itself go back to the normal fast-update
path (`scp` it into `APP_DIR`, then `docker restart bench`) -- it's only this first rollout that
needs the heavier steps, because of the new dependency and new mount.

**Worth testing small first**: this is new and hasn't been run against a real folder yet. Try it
on 5-10 cards in their own subfolders before pointing it at a folder of thousands, so any
surprises show up on a handful of cards rather than your whole backlog.

## Backing up your data

Everything -- your cards, photos, checklist progress -- lives in one SQLite file inside the
`bench-data` Docker volume. To back it up, either use Portainer's volume browser to copy
out `card-ledger.db`, or run this on the Portainer host:

```
docker run --rm -v bench_bench-data:/data -v $(pwd):/backup alpine \
  cp /data/card-ledger.db /backup/bench-backup.db
```

(the volume name may have a different stack-name prefix depending on how Portainer named it --
check under **Volumes** in Portainer if that exact name doesn't match; it's usually
`<stack name>_bench-data`).

## Updating later

If you (or a future Claude session) change `src/card_ledger.jsx` and want to redeploy:

```
npm install       # first time only, pulls in esbuild/react for the build step
npm run build     # rebuilds public/app.bundle.js from src/
```

Then repeat Step 1 (rebuild the image with the same tag) and use Portainer's **Update the
stack** (Stacks -> bench -> pull and redeploy, or just re-deploy after rebuilding the
image) to pick up the new version. Your data isn't touched by this -- it lives in the separate
volume, not in the image.
