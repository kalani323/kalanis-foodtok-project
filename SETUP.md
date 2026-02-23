# fork&scroll — Setup Guide

## What you need first (all free)
- [VS Code](https://code.visualstudio.com/) — code editor
- [Node.js](https://nodejs.org/) — pick the LTS version
- [Git](https://git-scm.com/downloads) — version control
- [GitHub account](https://github.com/) — to host your code
- [Vercel account](https://vercel.com/) — to deploy (sign up with GitHub)
- [Anthropic API key](https://console.anthropic.com/) — for AI detection (free credits included)

---

## Step 1 — Open the project in VS Code

1. Move the `fork-and-scroll` folder somewhere you'll remember (e.g. your Desktop or Documents)
2. Open VS Code
3. Go to **File → Open Folder** and select the `fork-and-scroll` folder
4. Open the built-in terminal: **Terminal → New Terminal** (or press `` Ctrl+` ``)

---

## Step 2 — Install dependencies

In the VS Code terminal, run:

```bash
npm install
```

Wait for it to finish (about 30 seconds).

---

## Step 3 — Add your Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com/) and sign in
2. Click **API Keys** in the left sidebar → **Create Key**
3. Copy the key (starts with `sk-ant-...`)
4. In VS Code, open the file called `.env.local`
5. Replace `your_api_key_here` with your actual key:

```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxx
```

6. Save the file (**Ctrl+S**)

> ⚠️ Never share or commit this file — it's already in `.gitignore` so it won't be uploaded to GitHub.

---

## Step 4 — Run the app locally

In the terminal, run:

```bash
npm run dev
```

Then open your browser and go to: **http://localhost:3000**

Your app is running! Screenshot a TikTok, upload it, and watch Claude detect the restaurant.

Press **Ctrl+C** in the terminal to stop it.

---

## Step 5 — Push to GitHub

### First time setup (do this once)

1. Go to [github.com](https://github.com) and click the **+** → **New repository**
2. Name it `fork-and-scroll`
3. Leave it **Public** (required for free Vercel hosting)
4. Do NOT check "Add README" — click **Create repository**
5. GitHub will show you some commands. Copy the URL of your repo (looks like `https://github.com/yourusername/fork-and-scroll.git`)

### Push your code

In the VS Code terminal, run these commands one at a time:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/fork-and-scroll.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

Your code is now on GitHub! 🎉

---

## Step 6 — Deploy to Vercel (free hosting)

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New → Project**
3. Find `fork-and-scroll` in the list and click **Import**
4. On the configuration page, open **Environment Variables**
5. Add your API key:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your key from Step 3
6. Click **Deploy**

Vercel will build and deploy your app in about 60 seconds. You'll get a live URL like:

```
https://fork-and-scroll-yourusername.vercel.app
```

That's your real, working app — share it with anyone! 🚀

---

## After that — making changes

Whenever you want to update the app:

1. Make your changes in VS Code
2. Test locally with `npm run dev`
3. When happy, run in terminal:

```bash
git add .
git commit -m "describe what you changed"
git push
```

Vercel auto-deploys every time you push to GitHub. Your live app updates in ~30 seconds.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm install` fails | Make sure Node.js is installed: run `node --version` |
| App won't start | Check `.env.local` has your API key |
| Detection not working | Make sure the API key is added to Vercel's Environment Variables |
| `git push` asks for password | Use a GitHub Personal Access Token instead of your password ([guide](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)) |
