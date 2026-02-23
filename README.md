# Kalani's Favorite Restaurants
https://kalanis-foodtok-project.vercel.app/

A personal restaurant tracker that lets me save restaurants I discover on TikTok and Instagram. Upload a screenshot of any food video and Claude AI automatically detects the restaurant name, cuisine, location, price range, and vibe — no manual typing needed.

## Features

- **AI-powered screenshot detection** — upload a TikTok or Instagram screenshot and Claude reads the caption, location tag, and on-screen text to identify the restaurant automatically
- **Filter & search** — filter saved restaurants by cuisine, price range, vibe, and visited status
- **Visited tracking** — mark restaurants as visited to separate the wishlist from places I've been
- **Screenshot thumbnails** — the uploaded screenshot becomes the card image so I remember the vibe
- **Stats dashboard** — see how many restaurants are saved, visited, and how many cuisines have been explored

## Tech Stack

- **Next.js 14** — React framework with App Router
- **Anthropic Claude API** — vision model for screenshot analysis and restaurant detection
- **sharp** — server-side image compression before sending to the API
- **Vercel** — hosting and deploymentß