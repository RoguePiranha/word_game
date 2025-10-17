# Word Guess - Game Modes Implementation

## 🎮 Overview
Completely redesigned the word game with a modern menu system inspired by Balatro, featuring multiple game modes and a smooth navigation flow.

## ✨ New Features

### 1. Home Screen
- **Quick Start**: Instant 5-letter daily word challenge
  - Same word for everyone on the same day
  - Base difficulty
  - Perfect for casual daily play

- **Select Mode**: Custom game setup with full control
  - Choose game mode
  - Select word length
  - Pick difficulty level

### 2. Game Modes

#### Standard Mode ✅ IMPLEMENTED
- Classic word guessing gameplay
- No time pressure
- Full strategic thinking allowed

#### Timed Mode ⏱️ IMPLEMENTED
- Race against the clock!
- Dynamic time limits based on word length and difficulty
- Visual timer with urgency indicators
- Time limits:
  - 4-letter: 3-7 minutes (depending on difficulty)
  - 5-letter: 4-8 minutes
  - 6-letter: 5-10 minutes
  - 7-letter: 6-12 minutes
  - 8-letter: 7-14 minutes
- Game ends if time runs out

#### Scored Mode 🏆 COMING SOON
- Points based on speed and attempts
- Combo multipliers
- Leaderboards
- Daily challenges

#### Multiplayer Mode 👥 COMING SOON
- Real-time competition
- Turn-based play
- Head-to-head scoring

### 3. Navigation Flow
```
Home Screen
    ├─> Quick Start → Game (5-letter, Base, Daily Word)
    └─> Select Mode
            └─> Mode Selection (Standard/Timed/etc)
                    └─> Word Length (4/5/6/7/8)
                            └─> Difficulty (Base/Hard/Expert/Impossible)
                                    └─> Game
```

### 4. Timer System (Timed Mode)
- Countdown timer display
- Color-coded urgency:
  - Blue: Normal (>60s remaining)
  - Yellow: Warning (31-60s)
  - Red: Critical (<30s)
- Pulsing animation when time is low
- Automatic game over on timeout

### 5. Daily Word Feature
- Deterministic word selection based on current date
- Everyone gets the same daily word
- Changes at midnight
- Perfect for sharing scores with friends

## 🎨 UI/UX Improvements

### Screen Transitions
- Smooth slide animations (left/right)
- Back button navigation
- Consistent visual language

### Home Screen Design
- Large, bold title with gradient
- Two clear action buttons
- Icon-based navigation
- Responsive layout

### Mode Selection Screens
- Card-based interface
- Hover effects
- Clear visual hierarchy
- Mobile-optimized grid layouts

### Timer Display
- Prominent position in header
- Large, readable font
- Animated urgency states
- Accessible timer icon

## 🎯 Game Configuration

### Attempts by Word Length & Difficulty
```
4-letter:
  - Base: 6 attempts
  - Hard: 5 attempts
  - Expert: 4 attempts
  - Impossible: 3 attempts

5-letter:
  - Base: 6 attempts
  - Hard: 5 attempts
  - Expert: 4 attempts
  - Impossible: 3 attempts

6-letter:
  - Base: 7 attempts
  - Hard: 6 attempts
  - Expert: 5 attempts
  - Impossible: 4 attempts

7-letter:
  - Base: 8 attempts
  - Hard: 7 attempts
  - Expert: 6 attempts
  - Impossible: 5 attempts

8-letter:
  - Base: 8 attempts
  - Hard: 6 attempts
  - Expert: 5 attempts
  - Impossible: 4 attempts
```

### Time Limits (Timed Mode)
Calculated as: Base Time × Difficulty Multiplier

**Base Times:**
- 4-letter: 180 seconds (3 minutes)
- 5-letter: 240 seconds (4 minutes)
- 6-letter: 300 seconds (5 minutes)
- 7-letter: 360 seconds (6 minutes)
- 8-letter: 420 seconds (7 minutes)

**Difficulty Multipliers:**
- Base: 1.0 (full time)
- Hard: 0.85 (15% less time)
- Expert: 0.7 (30% less time)
- Impossible: 0.6 (40% less time)

## 🚀 How to Play

### Quick Start:
1. Open the game
2. Click "Quick Start"
3. Start playing immediately!

### Custom Game:
1. Click "Select Mode"
2. Choose your game type (Standard or Timed)
3. Pick word length (4-8 letters)
4. Select difficulty level
5. Start playing!

### During Game:
- **Home Button**: Return to home screen anytime
- **New Button**: Start a new game with same settings
- **Hint Button**: Get a helpful hint (limited uses)
- **Settings**: Adjust theme and other options

## 📱 Mobile Support
- Fully responsive design
- Touch-optimized buttons
- Adaptive grid layouts
- Performance-optimized animations

## 🌈 Theme Support
Both light and dark themes fully supported across all new screens.

## 🔮 Future Enhancements

### Planned Features:
1. **Scored Mode**
   - Point system based on speed + attempts
   - Streak bonuses
   - Perfect game bonuses
   - Daily/weekly leaderboards

2. **Multiplayer Mode**
   - WebSocket-based real-time play
   - Room codes for friends
   - Spectator mode
   - Chat system

3. **Enhanced Hint System**
   - Earned hints (must play one word first)
   - Limited by word length
   - Reveals stop when all letters shown
   - Strategic hint timing becomes crucial

4. **Achievements System**
   - Speed demon (win under X seconds)
   - Perfect game (no wrong guesses)
   - Streak master (X wins in a row)
   - Completionist (try all modes)

5. **Statistics**
   - Per-mode stats
   - Time-based analytics
   - Word length performance
   - Difficulty progression tracking

## 💡 Technical Notes

### Key Functions:
- `showScreen(screenId)` - Display a specific screen
- `slideToScreen(screenId, direction)` - Animated screen transition
- `startTimer()` - Begin timed mode countdown
- `stopTimer()` - Stop the timer
- `getDailyWord(wordList)` - Generate daily word
- `resetGame()` - Reset board for new game
- `getTimeLimitForLength(length, diff)` - Calculate time limit

### State Variables:
- `gameMode` - Current game mode (standard/timed/etc)
- `selectedMode` - Mode chosen in selection
- `selectedLength` - Word length chosen
- `selectedDifficulty` - Difficulty chosen
- `timerInterval` - Timer update interval
- `startTime` - Game start timestamp
- `timeLimit` - Total time allowed (seconds)
- `timeRemaining` - Current remaining time

## 🐛 Testing Checklist
- [x] Home screen loads correctly
- [ ] Quick Start launches daily 5-letter game
- [ ] Mode selection navigation works
- [ ] Length selection updates difficulty display
- [ ] Difficulty selection starts game
- [ ] Timed mode timer counts down
- [ ] Timer color changes with urgency
- [ ] Game ends on timeout
- [ ] Home button returns to home screen
- [ ] Theme switcher works on all screens
- [ ] Mobile layout adapts properly
- [ ] Animations are smooth

## 🎨 Design Philosophy
- **Clarity**: Always clear what options are available
- **Feedback**: Immediate visual response to actions
- **Consistency**: Same interaction patterns throughout
- **Accessibility**: Large touch targets, readable text
- **Performance**: Smooth animations, fast load times
