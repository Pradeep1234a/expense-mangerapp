# StudyWallet – AI Student Expense Manager
## Complete Deployment Guide

---

## 📁 Project Structure
```
studywallet/
├── index.html       ← Main app (Auth + all pages)
├── style.css        ← Complete stylesheet
├── app.js           ← Full app logic + Supabase integration
├── manifest.json    ← PWA manifest
├── sw.js            ← Service Worker (offline support)
└── README.md        ← This file
```

---

## 🗄️ Supabase Database Schema (SQL)

Run this in your Supabase SQL Editor:

```sql
-- USERS PROFILE TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  full_name TEXT,
  university TEXT,
  currency TEXT DEFAULT 'INR',
  monthly_budget NUMERIC DEFAULT 5000,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- INCOMES TABLE
CREATE TABLE IF NOT EXISTS public.incomes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  source TEXT NOT NULL DEFAULT 'Other',
  -- source options: Parent, Internship, Scholarship, Part-time, Other
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL DEFAULT 'Other',
  -- categories: Food, Rent, Travel, Shopping, Education, Health, Entertainment, Other
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SAVINGS GOALS TABLE
CREATE TABLE IF NOT EXISTS public.savings_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Monthly Savings',
  target_amount NUMERIC NOT NULL CHECK (target_amount > 0),
  current_amount NUMERIC DEFAULT 0,
  month TEXT NOT NULL, -- format: YYYY-MM
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- GAME SCORES TABLE
CREATE TABLE IF NOT EXISTS public.game_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  game_name TEXT NOT NULL,
  -- game names: dodge, quiz, reaction
  score INTEGER DEFAULT 0,
  played_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ ROW LEVEL SECURITY ═══

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;

-- Users: own data only
CREATE POLICY "users_own" ON public.users FOR ALL USING (auth.uid() = id);

-- Incomes: own data only
CREATE POLICY "incomes_own" ON public.incomes FOR ALL USING (auth.uid() = user_id);

-- Expenses: own data only
CREATE POLICY "expenses_own" ON public.expenses FOR ALL USING (auth.uid() = user_id);

-- Savings goals: own data only
CREATE POLICY "goals_own" ON public.savings_goals FOR ALL USING (auth.uid() = user_id);

-- Game scores: users see all (leaderboard), insert own only
CREATE POLICY "scores_select_all" ON public.game_scores FOR SELECT USING (true);
CREATE POLICY "scores_insert_own" ON public.game_scores FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, currency, monthly_budget)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'INR',
    5000
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();
```

---

## ⚙️ Supabase Setup

1. Create account at **supabase.com**
2. New project → choose region close to your users
3. Go to **SQL Editor** → paste the SQL above and run
4. Go to **Authentication → Providers**:
   - Enable **Email** (on by default)
   - Enable **Google OAuth** (optional): add Client ID + Secret
5. Go to **Project Settings → API**:
   - Copy `Project URL` and `anon public` key
   - Update in `app.js`:
     ```js
     const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
     const SUPABASE_KEY = 'your_anon_key_here';
     ```

---

## 🤖 AI Chatbot Setup (Anthropic Claude)

1. Get API key from **console.anthropic.com**
2. In the app → Settings → paste key in "AI API Key" field
3. OR hardcode in `app.js` (not recommended for production):
   ```js
   APP.apiKey = 'sk-ant-...your-key...';
   ```

Without a key, the chatbot uses a smart local response engine.

---

## 🚀 Deploy to Vercel (Recommended)

### Option A: Drag & Drop
1. Go to **vercel.com** → New Project
2. Drag the `studywallet/` folder into the upload area
3. Click Deploy → done!

### Option B: GitHub + Vercel CI/CD
```bash
# 1. Create GitHub repo
git init
git add .
git commit -m "Initial StudyWallet deploy"
git remote add origin https://github.com/YOUR_USER/studywallet.git
git push -u origin main

# 2. Import in Vercel
# Go to vercel.com → New Project → Import from GitHub
# Select your repo → Deploy (no build config needed for static)
```

### vercel.json (optional, for clean routing)
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/sw.js",
      "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
    }
  ]
}
```

---

## 📱 Install as Mobile App (PWA)

### Android (Chrome):
1. Open the site in Chrome
2. Menu → "Add to Home Screen"
3. Tap "Add" → app icon appears!

### iOS (Safari):
1. Open in Safari
2. Tap Share button (□↑)
3. "Add to Home Screen" → Add

### Register Service Worker (add to index.html before </body>):
```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
</script>
```

---

## 🔧 Local Development

No build tools needed! Just serve static files:

```bash
# Python (built-in)
python3 -m http.server 3000

# Node.js (npx)
npx serve .

# VS Code: use Live Server extension
```

Open: **http://localhost:3000**

---

## 🎮 Game Scores & Leaderboard

Game scores are saved to Supabase `game_scores` table:
- All users can see the leaderboard (public SELECT policy)
- Only authenticated users can submit scores
- Displays top 5 per game

---

## 🔒 Security Features

- ✅ Supabase Row Level Security (RLS) on all tables
- ✅ Users can only access their own data
- ✅ Supabase Auth manages sessions (JWT tokens)
- ✅ No passwords stored in app (Supabase handles auth)
- ✅ API key stored in memory only (not localStorage)
- ✅ HTTPS enforced on Vercel

---

## 📊 Feature Summary

| Feature | Status |
|---------|--------|
| Email/Password Auth | ✅ |
| Google OAuth | ✅ |
| Password Reset | ✅ |
| Add/Edit/Delete Income | ✅ |
| Add/Edit/Delete Expenses | ✅ |
| Real-time Sync (Supabase) | ✅ |
| Dashboard with Survival Days | ✅ |
| Monthly Savings Goals | ✅ |
| Spending Analytics (Charts) | ✅ |
| AI Chatbot (3 modes) | ✅ |
| Money Saver Dodge Game | ✅ |
| Budget Quiz (10 questions) | ✅ |
| Reaction Speed Game | ✅ |
| Supabase Leaderboard | ✅ |
| Shareable Parent Link | ✅ |
| Dark/Light Mode | ✅ |
| Multi-currency Support | ✅ |
| Mobile Responsive | ✅ |
| PWA (Installable) | ✅ |
| Offline Support (SW) | ✅ |
| Row Level Security | ✅ |
