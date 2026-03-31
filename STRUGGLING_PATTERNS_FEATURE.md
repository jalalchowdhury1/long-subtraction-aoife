# Struggling Patterns Feature Implementation

This document describes how the "struggling patterns" feature was implemented to track and repeat equations that a child struggles with. It is designed to be **easily adaptable** to similar games (addition, multiplication, etc.).

---

## Overview

The feature allows:
1. **Time tracking** - Measure how long it takes to answer each equation
2. **Pattern identification** - Identify the slowest/most difficult equations
3. **Priority logic** - Mistakes are prioritized over slow answers
4. **Persistence** - Save stats to localStorage so they accumulate across sessions
5. **Selective repetition** - Let parents/teachers choose which equations to repeat

---

## Configuration Parameters

These are the key values to customize for different games:

| Parameter | Subtraction Game | Addition Game Example | Description |
|-----------|-----------------|---------------------|-------------|
| `MAX_NUM` | 20 | 15 | Highest number for operands |
| `TOTAL_QUESTIONS` | 20 | 10 | Questions per round |
| `MAX_STRUGGLING` | 5 | 5 | Max equations to repeat |
| `localStorage key` | `aoife-math-subtraction-progress` | `aoife-math-addition-progress` | Unique key per game |
| `operator` | `-` (subtraction) | `+` (addition) | Math operation |

---

## Implementation Details

### 1. State Variables Added

```typescript
const [currentQuestionTimes, setCurrentQuestionTimes] = useState<Record<string, number>>({});
const [sessionTimesShown, setSessionTimesShown] = useState<Record<string, number>>({});
const [showAdmin, setShowAdmin] = useState(false);
const [repeatStruggling, setRepeatStruggling] = useState(true);
const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
const [sessionIncorrectIds, setSessionIncorrectIds] = useState<string[]>([]);
```

- `currentQuestionTimes`: Tracks time spent on each equation in the current session
- `sessionTimesShown`: Tracks how many times each equation was shown in current session
- `showAdmin`: Controls visibility of the admin panel
- `repeatStruggling`: Master toggle for repeating difficult equations
- `selectedPatterns`: Which specific equations the user has selected to repeat
- `sessionIncorrectIds`: Tracks equations answered incorrectly this session

### 2. Question ID Format

Each question has a unique ID that serves as the key for tracking:

```typescript
// In generateQuestion():
// For subtraction: id = "20-5" where 20-5=15
// For addition: id = "8+7" where 8+7=15

return { num1, num2, answer, id: `${num1}${OPERATOR}${num2}` };
```

**For subtraction**: `id: `${num1}-${num2}`` (e.g., "20-5")
**For addition**: `id: `${num1}+${num2}`` (e.g., "8+7")

### 3. QuestionStats Interface

Tracks detailed statistics for each equation:

```typescript
interface QuestionStats {
  correct: number;
  incorrect: number;
  lastAttempt: number;
  timesShown: number;
  totalTime: number; // total time spent on this equation in ms
  avgTime: number;   // average time per correct answer
  timesShownInCurrentSession: number;
}
```

### 4. Time Tracking Logic

Inside `handleAnswer()`, track time and update stats after each answer:

```typescript
// Calculate time spent on this question
const questionTime = Date.now() - questionStartTimeRef.current;
const questionId = currentQuestion?.id || "";

// Update questionStats for this equation (persist across sessions)
const updatedStats = { ...progress.questionStats };
const existing = updatedStats[questionId] || { correct: 0, incorrect: 0, lastAttempt: 0, timesShown: 0, totalTime: 0, avgTime: 0, timesShownInCurrentSession: 0 };

if (isCorrect) {
  updatedStats[questionId] = {
    correct: existing.correct + 1,
    incorrect: existing.incorrect,
    lastAttempt: Date.now(),
    timesShown: existing.timesShown + 1,
    totalTime: existing.totalTime + questionTime,
    avgTime: (existing.totalTime + questionTime) / (existing.correct + 1),
    timesShownInCurrentSession: (existing.timesShownInCurrentSession || 0) + 1
  };
} else {
  updatedStats[questionId] = {
    correct: existing.correct,
    incorrect: existing.incorrect + 1,
    lastAttempt: Date.now(),
    timesShown: existing.timesShown + 1,
    totalTime: existing.totalTime + questionTime,
    avgTime: existing.avgTime, // Don't update avgTime on wrong answers
    timesShownInCurrentSession: (existing.timesShownInCurrentSession || 0) + 1
  };
}
```

### 5. Calculate Slowest Equations Function

This function determines which equations are "struggling" and should be repeated. **Priority order: First mistakes, then slowest by time.**

```typescript
const calculateSlowestEquations = (
  currentTimes: Record<string, number>,
  sessionShown: Record<string, number>,
  existingStats: Record<string, QuestionStats>,
  incorrectIds: string[]
): string[] => {
  const result: string[] = [];
  const addedIds = new Set<string>();

  // FIRST: Add all equations answered incorrectly (up to MAX_STRUGGLING)
  for (const id of incorrectIds) {
    if (result.length >= MAX_STRUGGLING) break;
    if (!addedIds.has(id)) {
      result.push(id);
      addedIds.add(id);
    }
  }

  // SECOND: Fill remaining slots with slowest equations by avgTime
  const allCandidates: { id: string; avgTime: number }[] = [];

  const allIds = new Set([
    ...Object.keys(currentTimes),
    ...Object.keys(sessionShown),
    ...Object.keys(existingStats)
  ]);

  for (const id of allIds) {
    if (addedIds.has(id)) continue;
    const existing = existingStats[id];
    const sessionTime = currentTimes[id];
    const avgTime = sessionTime || existing?.avgTime || 0;
    if (avgTime > 0) {
      allCandidates.push({ id, avgTime });
    }
  }

  // Sort by slowest (highest time) first
  allCandidates.sort((a, b) => b.avgTime - a.avgTime);

  // Add slowest to fill up to MAX_STRUGGLING
  for (const candidate of allCandidates) {
    if (result.length >= MAX_STRUGGLING) break;
    if (!addedIds.has(candidate.id)) {
      result.push(candidate.id);
      addedIds.add(candidate.id);
    }
  }

  return result;
};
```

### 6. Tracking Incorrect Answers

```typescript
// Reset on new game
setSessionIncorrectIds([]);

// Track when answer is wrong (on second attempt):
setSessionIncorrectIds(prev =>
  prev.includes(questionId) ? prev : [...prev, questionId]
);
```

### 7. Saving Progress at End of Round

At the end of each game (when `currentQuestionIndex === TOTAL_QUESTIONS - 1`):

```typescript
// Calculate slowest equations using updated stats
const slowestEquations = calculateSlowestEquations(
  currentQuestionTimes, 
  sessionTimesShown, 
  updatedStats,  // Use updated stats, not old progress
  sessionIncorrectIds
);

// Save progress with questionStats and struggling patterns
const newProgress = { ...progress, questionStats: updatedStats };
newProgress.strugglingPatterns = slowestEquations;
newProgress.totalCorrect += score;
newProgress.totalIncorrect += wrongCount;
newProgress.lastPlayed = Date.now();
setProgress(newProgress);
saveProgress(newProgress);
```

### 8. Using Struggling Patterns in Game Initialization

```typescript
const initializeGame = useCallback(() => {
  const loadedProgress = loadProgress();
  
  if (repeatStruggling) {
    const strugglingPatterns = loadedProgress.strugglingPatterns || [];
    for (const pattern of strugglingPatterns) {
      // Parse based on operator
      const [n1, n2] = pattern.split(OPERATOR_REGEX).map(Number);
      if (n1 !== undefined && n2 !== undefined) {
        const q: Question = {
          num1: n1,
          num2: n2,
          answer: calculateAnswer(n1, n2), // n1 + n2 or n1 - n2
          id: pattern
        };
        newQuestions.push(q);
        usedIds.add(pattern);
      }
    }
  }
  
  // Fill rest with random questions...
}, [loadProgress, repeatStruggling]);
```

### 9. ProgressData Interface

```typescript
interface ProgressData {
  questionStats: Record<string, QuestionStats>;
  totalCorrect: number;
  totalIncorrect: number;
  sessionCount: number;
  lastPlayed: number;
  masteredPatterns: string[];
  strugglingPatterns: string[];
  bestTime: number | null;
}
```

---

## Adapting to Addition Game

### Changes Required:

1. **Update generateQuestion()**:
```typescript
const generateQuestion = (): Question => {
  const num1 = Math.floor(Math.random() * (MAX_NUM + 1)); // 0 to MAX_NUM
  const num2 = Math.floor(Math.random() * (MAX_NUM + 1));
  return { num1, num2, answer: num1 + num2, id: `${num1}+${num2}` };
};
```

2. **Update localStorage key**:
```typescript
const PROGRESS_KEY = "aoife-math-addition-progress";
```

3. **Adjust TOTAL_QUESTIONS** (e.g., 10 instead of 20)

4. **Update display** (change "−" to "+" in JSX)

5. **Parse patterns correctly** (split on "+" not "-")

### Minimal Code Changes:

| Component | Subtraction | Addition |
|-----------|-------------|----------|
| `generateQuestion` | `num1 - num2` | `num1 + num2` |
| ID format | `"20-5"` | `"8+7"` |
| Display operator | `−` | `+` |
| Parse ID | `.split('-')` | `.split('+')` |
| localStorage key | `aoife-math-subtraction-progress` | `aoife-math-addition-progress` |

---

## Adapting to Multiplication Game

| Component | Change |
|-----------|--------|
| `generateQuestion` | `num1 * num2` |
| ID format | `"6x7"` |
| Display | `×` |
| Parse ID | `.split('x')` |
| localStorage key | `aoife-math-multiplication-progress` |
| MAX_NUM | 10 or 12 |

---

## Key Design Decisions

1. **Priority: Mistakes First, Then Slowest**: Mistakes are added first (up to MAX_STRUGGLING). Remaining slots filled with slowest equations by time.

2. **Question ID as Pattern**: Using `num1${op}num2` as the ID makes it easy to parse and reconstruct equations.

3. **Top 5 Total**: Limited to MAX_STRUGGLING equations to avoid overwhelming the child.

4. **Historical + Session Tracking**: Track both current session and historical data in `questionStats` for accurate avgTime.

5. **Persistence**: Data saves to localStorage so stats accumulate across browser sessions.

6. **Individual Toggles**: Parents can choose specific equations rather than blanket repeat.

---

## Testing Checklist

- [ ] Play a full round and verify equations appear in admin panel
- [ ] Test tap outside to close admin panel
- [ ] Test individual equation toggles
- [ ] Verify stats persist after closing and reopening browser
- [ ] Verify stats accumulate across multiple rounds
- [ ] Check "repeat difficult ones" toggle works
- [ ] Verify equations appear shuffled, not in order
