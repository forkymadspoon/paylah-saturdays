# Deploying this page on GitHub Pages (free, no domain needed)

1. Go to https://github.com/new and create a **public** repo (any name, e.g. `paylah-search`).
2. Add this file to the repo, named exactly `index.html` (already named that way here) —
   either drag-and-drop it in the GitHub web UI ("uploading an existing file"), or:
   ```
   git init
   git add index.html
   git commit -m "Initial deploy"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
3. In the repo, go to **Settings → Pages**.
4. Under "Build and deployment", set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`. Save.
5. Wait ~1 minute, then your page is live at:
   `https://<your-username>.github.io/<repo-name>/`

## Adding the view counter

Open `index.html`, find the `ANALYTICS SLOT` comment block near the bottom
(just before `</body>`), pick **GoatCounter** or **Google Analytics**, follow
the 2–3 steps in the comment, then uncomment that `<script>` tag and delete
the other option. Commit and push again — GitHub Pages redeploys automatically
in under a minute.

Every future edit is the same loop: edit `index.html` → commit → push →
GitHub Pages picks it up on its own.
