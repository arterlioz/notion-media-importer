# Setup Guide — Notion Media Importer

A detailed walkthrough to get the extension running. Takes about 5 minutes.

---

## Before you start

You'll need:
- A **Notion account** (free works fine)
- **Google Chrome** browser
- This repository downloaded or cloned to your computer

---

## Step 1 → Duplicate the Notion template

This gives you a pre-built media tracker database with all the right properties.

**[Click here to duplicate the template](https://pattern-bubble-b1c.notion.site/template-0e37a73dfb8982b7b2ad8113edc60eba?source=copy_link)**

When you click the link, Notion will ask you to duplicate it into your workspace. Click **"Duplicate"** and it'll appear in your sidebar.

The template includes a database with these properties already configured:
- **Title** — name of whatever you're saving
- **By** — author, channel, or host
- **Media Type** — select from Essay 📄, Article 📑, Guide 📝, Podcast 🎙️, Video 🎥, Book 📖, Movie & Show 🎬
- **Link** — the original URL
- **Synopsis** — auto-generated summary
- **Status** — Not started / In progress / Finished
- **Rating** — ⭐️ through ⭐️⭐️⭐️⭐️⭐️
- **Date Finished** — when you completed it

---

## Step 2 → Create a Notion integration

The extension needs an "integration" — a secure connection that lets it write to your Notion database.

1. Go to **[notion.so/my-integrations](https://www.notion.so/my-integrations)**

2. Click **"+ New integration"**

3. Fill in the basics:
   - **Name**: `Media Importer` (or whatever you like)
   - **Associated workspace**: select your workspace
   - **Type**: keep as "Internal"

4. Click **"Submit"**

5. You'll see your **Internal Integration Token** — it starts with `ntn_` or `secret_`

6. **Copy this token** and save it somewhere. You'll paste it into the extension later.

> **Security note**: This token gives access to whatever you share with the integration. Don't commit it to git or share it publicly. The extension stores it in Chrome's sync storage, which is encrypted and tied to your Google account.

---

## Step 3 → Connect the integration to your database

This is the step people most often skip — and then wonder why they get an "unauthorized" error.

Your integration can **only access pages you explicitly connect it to**.

1. Open the Notion page where you duplicated the media tracker template

2. Click the **⋯** button (three dots) in the **top right** corner of the page

3. Scroll down and click **"Add connections"** (or "Connections" depending on your Notion version)

4. Search for your integration name (e.g., "Media Importer")

5. Select it and click **"Confirm"**

You should see your integration listed under Connections. It now has permission to read and write to this page and the database inside it.

---

## Step 4 → Find your database ID

The extension needs the ID of the **database**, not the page that contains it.

### Option A: From the database link

1. In your Notion template page, hover over the database
2. Click the **⋯** menu on the database itself (not the page)
3. Click **"Copy link to view"**
4. You'll get a URL like:
   ```
   https://www.notion.so/your-workspace/abc123def456?v=xyz789
   ```
5. The database ID is the part between the last `/` and the `?` — in this case: `abc123def456`

### Option B: Open as full page

1. Click the **⋯** menu on the database
2. Click **"Open as full page"**
3. Look at the URL in your browser's address bar
4. The database ID is the long string at the end of the URL

The ID is a 32-character hexadecimal string (letters and numbers only).

> **Common mistake**: Using the page ID instead of the database ID. The page that *contains* the database has a different ID. If you get a "property names don't match" error, double-check you're using the database ID.

---

## Step 5 → Install the Chrome extension

1. **Download this repository**
   - Click the green "Code" button on GitHub → "Download ZIP"
   - Or clone: `git clone https://github.com/YOUR_USERNAME/notion-media-importer.git`

2. **Unzip** the download if needed

3. Open Chrome and go to **`chrome://extensions/`**

4. Turn on **"Developer mode"** — the toggle is in the top right corner

5. Click **"Load unpacked"**

6. Select the `notion-media-importer` folder (the one containing `manifest.json`)

7. The extension icon should appear in your toolbar. If you don't see it, click the puzzle piece icon (🧩) in Chrome's toolbar and **pin** the Notion Media Importer.

---

## Step 6 → Configure the extension

1. Click the extension icon in your toolbar

2. You'll see the setup screen asking for two things:
   - **Notion Integration Token** — paste the token from Step 2
   - **Notion Database ID** — paste the ID from Step 4

3. Click **"Save & Continue"**

That's it. You're ready to use it.

---

## Try it out

1. Navigate to any article, blog post, YouTube video, or podcast page

2. Click the extension icon

3. The extension will auto-fill:
   - **Title** — pulled from the page
   - **Author** — extracted from metadata (label changes to "Channel" for videos, "Host" for podcasts)
   - **Media Type** — detected from the URL
   - **Summary** — generated from the page's meta description or content

4. Edit anything you want to change

5. Click **"Add to Notion"**

6. Check your Notion database — the entry should be there with all fields populated

---

## Tips

- **Change the type**: If the auto-detection picks the wrong type, just change it in the dropdown before importing
- **Edit the summary**: The auto-generated summary is a starting point — edit it or write your own
- **Regenerate**: Click "↻ Regenerate Summary" if the first extraction wasn't great
- **Settings**: Click the ⚙️ icon anytime to update your token or database ID
- **Videos**: YouTube summaries are intentionally left blank unless the video has a real custom description

---

## If something goes wrong

| Error | Fix |
|---|---|
| "Integration not connected" | Go back to Step 3 — connect your integration to the database page |
| "Property names don't match" | Your database properties or emoji format doesn't match. Use the template, or see the Customization section in the README |
| Extension doesn't appear | Make sure Developer mode is on in `chrome://extensions/` and you selected the right folder |
| Can't extract metadata | Some sites block content scripts. Enter the info manually |
| Token starts with `secret_` | That's fine — older integrations use `secret_`, newer ones use `ntn_`. Both work |

---

## Updating the extension

When there's a new version:

1. Replace the files in your extension folder with the updated ones
2. Go to `chrome://extensions/`
3. Click the **reload** button (🔄) on the Notion Media Importer card
4. That's it — no need to remove and re-add

Your settings (token and database ID) are saved in Chrome and persist across reloads.

---

*Questions or issues? Open a GitHub issue and I'll help you out.*
