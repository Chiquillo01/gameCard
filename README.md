<p align="center">
  <img src="./screenshots/logo.png" alt="PixelQuest Logo" width="300"/>
</p>

# 🧙‍♂️ PixelQuest TCG

> *Forge your legend, card by card.*

![Alpha](https://img.shields.io/badge/status-alpha-blueviolet)
![Tech Stack](https://img.shields.io/badge/built_with-React%20%7C%20Node.js%20%7C%20MongoDB-informational)
![License](https://img.shields.io/badge/license-MIT-green)
![Contributions](https://img.shields.io/badge/contributions-welcome-yellow)

---

## ✨ About PixelQuest

**PixelQuest** is a collectible trading card game (TCG) that blends the nostalgic charm of retro pixel art with the strategic depth of fantasy. Inspired by legendary worlds like *Magic: The Gathering*, *Yu-Gi-Oh!* and *Dungeons & Dragons*, PixelQuest invites players to dive into a world of magic, mystery, and deck-building mastery.

Build your deck, collect cards through magical chests, manage your collection, and prepare for future PvP and PvE battles — all in a vibrant 16-bit fantasy universe.

> *In a forgotten realm of pixels, a new adventure awakens. Will you answer the call?*

---

## 🚀 Live Demo

🔗 [https://pixelquest-tcg.netlify.app/](https://pixelquest-tcg.netlify.app/)

---

## 🧭 Table of Contents

- [Live Demo](#-live-demo)
- [Project Status](#-project-status)
- [Tech Stack](#-tech-stack)
- [Installation](#-installation)
- [Folder Structure](#-folder-structure)
- [Screenshots](#-screenshots)
- [World & Lore](#-world--lore-coming-soon)
- [Contributing](#-contributing)
- [Team](#-team)
- [License](#-license)
- [Support the Quest](#-support-the-quest)

---

## 🎯 Project Status

PixelQuest is currently in **alpha stage**.

### ✅ Implemented Features

- 🔐 User registration and login
- 🧳 Inventory and card collection
- 🎁 Chest store with randomized rewards
- 💰 PixelCoins and PixelGems currency system
- 🧩 Deck builder
- 🛍️ Community market (v1)
- 📜 Purchase history
- 👤 Basic profile customization

### 🛠 Upcoming Features

- ⚔️ PvP and PvE battle system
- 💳 Stripe integration for PixelGem purchases
- 🏆 Leaderboards and community events
- 📱 Mobile optimizations and advanced UI polish

---

## 🧪 Tech Stack

This is a **full-stack monorepo** project using:

### Frontend
- ⚛️ React 18
- ⚡ Vite
- 🎨 CSS Modules
- 🌐 React Router DOM
- 📡 Axios
- 🔔 React Toastify
- 🔌 socket.io-client

### Backend
- 🧠 Node.js
- 🚂 Express
- 🧬 MongoDB + Mongoose
- 👨‍💻 Nodemon
- 🔌 socket.io

### Tooling & Deployment
- 🧪 Insomnia (API testing)
- 🌍 Netlify (frontend hosting)
- 📦 npm (package management)

---

## 📦 Installation

Clone the repo and install dependencies:

```bash
git clone https://github.com/your-username/pixelquest-tcg.git
cd pixelquest-tcg
npm install
```
Replace 'your-username' with your actual GitHub username or organization.

---

### 🔧 Environment Setup

Create a `.env` file at the root with your environment variables:

```env: backend
MONGO_URL = mongodb+srv://nuclio-tcg:Bootcamp10*@cluster0.5tmnw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0;
JWT_SECRET_KEY="yourTokenPwd";
PORT=3001
CLOUDINARY_URL=cloudinary://{pwd}:{secure:pwd}
```
```env: frontend
VITE_BACKEND_API_URL=http://example:localhost:3001/
REACT_APP_SOCKET_URL=ws://example:localhost:3001
```
---

### ▶️ Run the app

This project uses a monorepo structure — both frontend and backend are launched together:

```bash
npm run dev
```

---

## 📁 Folder Structure

```
pixelquest-tcg/
│
├── backend/
│   └── src/
│       ├── controllers/
│       ├── data/
│       ├── middlewares/
│       ├── mongo/
│       ├── routers/
│       ├── security/
│       ├── services/
│       ├── socket/
│       ├── test/
│       ├── bootstrap.js
│       └── index.js
│    └── .env
│    └── package.json
│
├── frontend/
│   ├── .storybook/
│   ├── cypress/
│   ├── public/
│   ├── src/
│       ├── components/
│       ├── config/
│       ├── context/
│       ├── lib/
│       ├── stories/
│       ├── App.jsx
│       ├── index.css
│       ├── main.jsx
│   ├── storybook-static/
│   ├── .env
│   ├── index.html
│   └── package.json
│
├── package.json
└── README.md
```

---

## 📸 Screenshots

### 🛍 Chest Store
![Chest Store](./screenshots/store.png)

### 🃏 Legendary Cards
![Hero of Hope](./screenshots/card_hope.png)
![Timewalk](./screenshots/card_timewalk.png)

### 🎴 Your Collection
![Collection](./screenshots/collection.png)

---

## 🌍 World & Lore (Coming Soon)
A vast pixelated realm full of forgotten ruins, enchanted forests, and arcane crystals awaits discovery...

> Soon, you'll uncover the myths, factions and elemental forces that shape the world of PixelQuest.

---

## 🤝 Contributing

We welcome all adventurers willing to contribute!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/YourFeature`)
3. Commit your changes (`git commit -m 'Add cool feature'`)
4. Push to the branch (`git push origin feature/YourFeature`)
5. Open a Pull Request

Please be respectful of the game's spirit and style. Pixel art is encouraged!

---

## 🧙‍♀️ Team

- [**Amaia Bordas**](https://github.com/abordasc)
- [**Edgar Chiquillo**](https://github.com/Chiquillo01)

---

## 📜 License

This project is open source and available under the [MIT License](LICENSE).

---

## 🌟 Support the Quest

If you enjoy the project, consider ⭐️ starring it or sharing it with fellow adventurers!

> *The cards have been drawn. The journey begins now...*

The cards have been drawn. The journey begins now... """
