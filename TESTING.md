# Testing Guide - Word Guess Game Modes

## Quick Test Steps

### 1. Initial Load
- [ ] Open `index.html` in your browser
- [ ] Home screen should appear with "WORD GUESS" title
- [ ] Two buttons visible: "Quick Start" and "Select Mode"

### 2. Quick Start (Daily Word)
- [ ] Click "Quick Start" button
- [ ] Should slide to game screen
- [ ] 5-letter game board appears
- [ ] Status shows "Daily 5-letter word • Attempts: 6. Good luck!"
- [ ] No timer visible (standard mode)
- [ ] Home button (🏠) visible in header

### 3. Mode Selection Flow
- [ ] Click Home button to return
- [ ] Click "Select Mode"
- [ ] Mode selection screen appears with 4 cards:
  - Standard (enabled)
  - Timed (enabled)
  - Scored (disabled/coming soon)
  - Multiplayer (disabled/coming soon)

### 4. Standard Mode Selection
- [ ] Click "Standard" card
- [ ] Length selection screen appears
- [ ] 5 cards showing 4, 5, 6, 7, 8 letters
- [ ] Click "5 Letters"
- [ ] Difficulty screen appears
- [ ] 4 cards showing Base (6 Attempts), Hard (5 Attempts), Expert (4 Attempts), Impossible (3 Attempts)
- [ ] Click any difficulty
- [ ] Game screen loads with correct settings
- [ ] No timer visible

### 5. Timed Mode Selection
- [ ] Return to home
- [ ] Navigate to Select Mode → Timed → 5 Letters → Base
- [ ] Game screen loads
- [ ] **Timer visible** at top of controls (e.g., "⏱️ 4:00")
- [ ] Timer counts down every second
- [ ] Play some guesses to verify game still works

### 6. Timer Behavior
- [ ] Watch timer count down
- [ ] When under 60 seconds: turns yellow and pulses
- [ ] When under 30 seconds: turns red and pulses faster
- [ ] If you let it reach 0:00: game should end automatically
- [ ] Should show "Time's up!" message

### 7. Navigation Back
- [ ] From any game screen, click Home button
- [ ] Should return to home screen
- [ ] Timer stops if in timed mode
- [ ] Can start new game

### 8. Different Word Lengths
Test each length to verify:
- [ ] 4-letter game (board = 4 columns)
- [ ] 5-letter game (board = 5 columns)
- [ ] 6-letter game (board = 6 columns)
- [ ] 7-letter game (board = 7 columns)
- [ ] 8-letter game (board = 8 columns)

### 9. Different Difficulties
Verify attempt counts update correctly:
- [ ] Base difficulty = most attempts
- [ ] Hard difficulty = fewer attempts
- [ ] Expert difficulty = even fewer
- [ ] Impossible difficulty = minimum attempts

### 10. Mobile Testing (if possible)
- [ ] Open on mobile device or resize browser
- [ ] Home screen buttons stack nicely
- [ ] Mode cards arrange in 2 columns
- [ ] Game board tiles scale appropriately
- [ ] Keyboard remains usable
- [ ] Timer display fits in header

### 11. Theme Switching
- [ ] Open settings panel (⚙️ gear icon)
- [ ] Switch between Light and Dark themes
- [ ] Verify home screen looks good in both
- [ ] Verify mode selection screens adapt
- [ ] Verify timer colors work in both themes

### 12. Daily Word Consistency
- [ ] Click Quick Start
- [ ] Note the word (reveal it if needed)
- [ ] Go home and Quick Start again
- [ ] Should be the same word (same day = same word)

## Common Issues to Check

### JavaScript Errors
Open browser console (F12) and check for:
- Any red error messages
- Failed network requests
- Undefined function calls

### Visual Issues
- Cards overlapping
- Text not readable
- Buttons too small
- Timer off-center
- Animations not smooth

### Functionality Issues
- Back button not working
- Timer not counting down
- Game not ending on timeout
- Home button not responding
- Mode selection not advancing

## Expected Behavior Summary

✅ **Home Screen**: Clean, two clear options
✅ **Quick Start**: Instant daily 5-letter game
✅ **Select Mode**: 3-step selection process
✅ **Standard Mode**: No timer, classic gameplay
✅ **Timed Mode**: Visible countdown timer with color changes
✅ **Navigation**: Back buttons and home button work
✅ **Animations**: Smooth screen transitions
✅ **Responsive**: Works on desktop and mobile
✅ **Themes**: Light and dark modes supported

## If Something Doesn't Work

1. **Check browser console** for JavaScript errors
2. **Verify file paths** - all files in correct locations?
3. **Clear browser cache** and reload
4. **Try a different browser** (Chrome, Firefox, Safari)
5. **Check word list files** - are words-4.json through words-8.json present in /words folder?

## Performance Notes

- First load may be slower (loading word lists)
- 5-letter word list is preloaded for Quick Start
- Other lengths load on-demand
- Animations should be 60fps on modern devices
- Timer updates 10 times per second for smoothness

## Next Steps After Testing

Once you confirm everything works:
1. Consider adding scored mode logic
2. Plan multiplayer architecture
3. Implement enhanced hint system
4. Add achievement tracking
5. Create leaderboard system
