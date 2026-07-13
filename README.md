🌐 Hyggshi OS Web Edition

Hyggshi OS Web Edition is a browser-based, OS-inspired creative platform that integrates AI generation tools powered by Pollinations AI. It provides a lightweight “operating system experience” where users can explore creative tools, generate images, and interact with AI-driven utilities in a structured desktop-like environment.

✨ Features
🖥️ Web-based OS-like interface
🎨 AI image generation using Pollinations API
⚡ Fast, serverless AI requests
🧠 Experimental creative workflows
📁 Modular app-like system inside the OS UI
🌍 Multilingual support (English / Vietnamese)
🧠 AI Integration

This project integrates with the Pollinations AI API to enable:

Text-to-image generation
Fast inference without API keys for end users
Scalable serverless AI workflows

Powered by: Pollinations

🚀 Live Demo

👉 https://hyggshi-os-website.pages.dev/OSmain

📦 Repository

👉 https://github.com/HyggshiOSDeveloper/hyggshi-os-website

🎯 Goal of the Project

The goal of Hyggshi OS is to explore how a browser-based operating system can be combined with AI generation tools to create a unified creative environment. It focuses on:

Accessibility (runs in browser)
Creativity (AI-powered tools)
Experimentation (OS-like modular UI)
🛠️ Tech Stack
HTML / CSS / JavaScript
Pollinations AI API
Cloudflare Pages (deployment)

## Run locally

Do not open `news.html` or `post.html` directly from the file system (`file://`). The news pages load Markdown with `fetch()` and use a JavaScript module, which browsers intentionally block for local files.

From the project folder, start a small local HTTP server instead:

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080/news.html](http://localhost:8080/news.html). You can also use the **Live Server** extension in VS Code. Cloudflare Pages already serves the site over HTTP(S), so no production change is needed.
📄 License

Open-source project for educational and experimental use.

🤝 Credits

Built with Pollinations AI
https://pollinations.ai
