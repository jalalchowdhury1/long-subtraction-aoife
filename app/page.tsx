"use client";
import { useState, useEffect, useCallback, useRef } from "react";

// Declare global confetti
declare global {
    interface Window {
        confetti: any;
    }
}

// Types
interface Question {
    num1: number;
    num2: number;
    answer: number;
    id: string;
}

interface QuestionStats {
    correct: number;
    incorrect: number;
    lastAttempt: number;
    timesShown: number;
    totalTime: number;
    avgTime: number;
    timesShownInCurrentSession: number;
}

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

type GameState = "loading" | "playing" | "success" | "try-again" | "show-answer" | "ended";

type MessageType = "none" | "try-again" | "correct" | "wrong" | "show-answer";

const MAX_STRUGGLING = 5;
const TOTAL_QUESTIONS = 20;
const OPERATOR_REGEX = /-/;


const generateQuestion = (): Question => {
    // Generate subtraction where num1 is 1-100 and num2 is 1-num1
    // This allows answers from 0 to 99
    const num1 = Math.floor(Math.random() * 100) + 1; // 1-100
    const num2 = Math.floor(Math.random() * num1) + 1; // 1 to num1
    const answer = num1 - num2;

    return { num1, num2, answer, id: `${num1}-${num2}` };
};

const calculateAnswer = (n1: number, n2: number): number => n1 - n2;

const PROGRESS_KEY = "aoife-long-subtraction-progress";

const getDefaultProgress = (): ProgressData => ({
    questionStats: {},
    totalCorrect: 0,
    totalIncorrect: 0,
    sessionCount: 1,
    lastPlayed: Date.now(),
    masteredPatterns: [],
    strugglingPatterns: [],
    bestTime: null,
});

export default function AoifeMathGame() {
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [userAnswer, setUserAnswer] = useState<number | null>(null);
    const [displayValue, setDisplayValue] = useState<string>("");
    const [score, setScore] = useState(0);
    const [gameState, setGameState] = useState<GameState>("loading");
    const [message, setMessage] = useState("");
    const [messageType, setMessageType] = useState<MessageType>("none");
    const [attempt, setAttempt] = useState(1);
    const [showAnswer, setShowAnswer] = useState(false);
    const [progress, setProgress] = useState<ProgressData>(getDefaultProgress());

    // Struggling patterns feature state
    const [currentQuestionTimes, setCurrentQuestionTimes] = useState<Record<string, number>>({});
    const [sessionTimesShown, setSessionTimesShown] = useState<Record<string, number>>({});
    const [showAdmin, setShowAdmin] = useState(false);
    const [repeatStruggling, setRepeatStruggling] = useState(true);
    const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
    const [sessionIncorrectIds, setSessionIncorrectIds] = useState<string[]>([]);
    const questionStartTimeRef = useRef<number>(Date.now());

    const loadProgress = useCallback((): ProgressData => {
        try {
            const stored = localStorage.getItem(PROGRESS_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                const dayInMs = 24 * 60 * 60 * 1000;
                if (Date.now() - data.lastPlayed > dayInMs) {
                    data.strugglingPatterns = (data.strugglingPatterns || []).slice(0, 5);
                    data.sessionCount += 1;
                    data.lastPlayed = Date.now();
                    localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
                }
                // Ensure bestTime exists
                if (data.bestTime === undefined) {
                    data.bestTime = null;
                }
                return data;
            }
        } catch (e) {
            console.error("Error loading progress:", e);
        }
        return getDefaultProgress();
    }, []);

    const saveProgress = (data: ProgressData) => {
        try {
            localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
        } catch (e) {
            console.error("Error saving progress:", e);
        }
    };

    // Calculate slowest equations function - Priority: Mistakes first, then slowest by time
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

        const allIdsSet = new Set([
            ...Object.keys(currentTimes),
            ...Object.keys(sessionShown),
            ...Object.keys(existingStats)
        ]);
        const allIds = Array.from(allIdsSet);

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

    const initializeGame = useCallback(() => {
        const loadedProgress = loadProgress();
        setProgress(loadedProgress);

        // Reset session tracking
        setCurrentQuestionTimes({});
        setSessionTimesShown({});
        setSessionIncorrectIds([]);

        // Generate TOTAL_QUESTIONS subtraction questions
        const newQuestions: Question[] = [];
        const usedIds = new Set<string>();

        // First, add struggling patterns if repeat is enabled
        if (repeatStruggling) {
            const strugglingPatterns = loadedProgress.strugglingPatterns || [];
            for (const pattern of strugglingPatterns) {
                if (newQuestions.length >= TOTAL_QUESTIONS) break;
                const [n1, n2] = pattern.split(OPERATOR_REGEX).map(Number);
                if (n1 !== undefined && n2 !== undefined && !usedIds.has(pattern)) {
                    const q: Question = {
                        num1: n1,
                        num2: n2,
                        answer: calculateAnswer(n1, n2),
                        id: pattern
                    };
                    newQuestions.push(q);
                    usedIds.add(pattern);
                }
            }
        }

        // Fill rest with random questions
        while (newQuestions.length < TOTAL_QUESTIONS) {
            const q = generateQuestion();
            if (!usedIds.has(q.id)) {
                newQuestions.push(q);
                usedIds.add(q.id);
            }
        }

        // Shuffle questions
        for (let i = newQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newQuestions[i], newQuestions[j]] = [newQuestions[j], newQuestions[i]];
        }

        setQuestions(newQuestions);
        setCurrentQuestionIndex(0);
        setScore(0);
        setUserAnswer(null);
        setDisplayValue("");
        setGameState("playing");
        setMessage("");
        setMessageType("none");
        setAttempt(1);
        setShowAnswer(false);
        questionStartTimeRef.current = Date.now();
    }, [loadProgress, repeatStruggling]);

    useEffect(() => {
        initializeGame();
    }, [initializeGame]);

    const currentQuestion = questions[currentQuestionIndex];

    const handleNumberPress = (num: number) => {
        if (gameState !== "playing") return;

        // Limit to 3 digits max (for numbers up to 100)
        if (displayValue.length < 3) {
            setDisplayValue(prev => prev + num);
        }
    };

    const handleClear = () => {
        if (gameState !== "playing") return;
        setDisplayValue("");
    };

    const handleSubmit = () => {
        if (gameState !== "playing") return;
        if (displayValue === "") return;

        const answer = parseInt(displayValue, 10);
        setUserAnswer(answer);

        // Calculate time spent on this question
        const questionTime = Date.now() - questionStartTimeRef.current;
        const questionId = currentQuestion?.id || "";

        // Track time for this question
        setCurrentQuestionTimes(prev => ({
            ...prev,
            [questionId]: (prev[questionId] || 0) + questionTime
        }));

        // Track times shown in session
        setSessionTimesShown(prev => ({
            ...prev,
            [questionId]: (prev[questionId] || 0) + 1
        }));

        const correct = answer === currentQuestion?.answer;

        if (correct) {
            setScore((prev) => prev + 1);
            if (typeof window !== "undefined" && window.confetti) {
                window.confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#f43f5e', '#a855f7', '#3b82f6', '#fbbf24']
                });
            }
            setMessage("🎉 Awesome! You got it right!");
            setMessageType("correct");
            setGameState("success");

            // Update question stats for correct answer
            const updatedStats = { ...progress.questionStats };
            const existing = updatedStats[questionId] || { correct: 0, incorrect: 0, lastAttempt: 0, timesShown: 0, totalTime: 0, avgTime: 0, timesShownInCurrentSession: 0 };
            updatedStats[questionId] = {
                correct: existing.correct + 1,
                incorrect: existing.incorrect,
                lastAttempt: Date.now(),
                timesShown: existing.timesShown + 1,
                totalTime: existing.totalTime + questionTime,
                avgTime: (existing.totalTime + questionTime) / (existing.correct + 1),
                timesShownInCurrentSession: (existing.timesShownInCurrentSession || 0) + 1
            };

            const timeoutId = setTimeout(() => {
                if (currentQuestionIndex < TOTAL_QUESTIONS - 1) {
                    setCurrentQuestionIndex((prev) => prev + 1);
                    setUserAnswer(null);
                    setDisplayValue("");
                    setGameState("playing");
                    setMessage("");
                    setMessageType("none");
                    setAttempt(1);
                    questionStartTimeRef.current = Date.now();
                } else {
                    // Calculate slowest equations using updated stats
                    const slowestEquations = calculateSlowestEquations(
                        currentQuestionTimes,
                        sessionTimesShown,
                        updatedStats,
                        sessionIncorrectIds
                    );

                    // Save progress with score and updated stats
                    const newProgress = { ...progress, questionStats: updatedStats };
                    newProgress.totalCorrect += score + 1;
                    newProgress.lastPlayed = Date.now();
                    newProgress.strugglingPatterns = slowestEquations;
                    setProgress(newProgress);
                    saveProgress(newProgress);
                    setGameState("ended");
                }
            }, 1500);

            // Update progress for next question
            setProgress(prev => ({ ...prev, questionStats: updatedStats }));
        } else {
            if (attempt === 1) {
                setMessage("Oops! Let's try one more time! 💪");
                setMessageType("try-again");
                setGameState("try-again");
                setDisplayValue("");
                setAttempt(2);
                setTimeout(() => {
                    setGameState("playing");
                    setMessage("");
                    setMessageType("none");
                }, 1500);
            } else {
                setMessage(`The correct answer is ${currentQuestion?.answer}!`);
                setMessageType("show-answer");
                setGameState("show-answer");
                setShowAnswer(true);

                // Track incorrect answer
                setSessionIncorrectIds(prev =>
                    prev.includes(questionId) ? prev : [...prev, questionId]
                );

                // Update question stats for incorrect answer
                const updatedStats = { ...progress.questionStats };
                const existing = updatedStats[questionId] || { correct: 0, incorrect: 0, lastAttempt: 0, timesShown: 0, totalTime: 0, avgTime: 0, timesShownInCurrentSession: 0 };
                updatedStats[questionId] = {
                    correct: existing.correct,
                    incorrect: existing.incorrect + 1,
                    lastAttempt: Date.now(),
                    timesShown: existing.timesShown + 1,
                    totalTime: existing.totalTime + questionTime,
                    avgTime: existing.avgTime, // Don't update avgTime on wrong answers
                    timesShownInCurrentSession: (existing.timesShownInCurrentSession || 0) + 1
                };

                const timeoutId = setTimeout(() => {
                    if (currentQuestionIndex < TOTAL_QUESTIONS - 1) {
                        setCurrentQuestionIndex((prev) => prev + 1);
                        setUserAnswer(null);
                        setDisplayValue("");
                        setGameState("playing");
                        setMessage("");
                        setMessageType("none");
                        setAttempt(1);
                        setShowAnswer(false);
                        questionStartTimeRef.current = Date.now();
                    } else {
                        // Calculate slowest equations using updated stats
                        const slowestEquations = calculateSlowestEquations(
                            currentQuestionTimes,
                            sessionTimesShown,
                            updatedStats,
                            sessionIncorrectIds
                        );

                        // Save progress with wrong answer and updated stats
                        const newProgress = { ...progress, questionStats: updatedStats };
                        newProgress.totalIncorrect += 1;
                        newProgress.lastPlayed = Date.now();
                        newProgress.strugglingPatterns = slowestEquations;
                        setProgress(newProgress);
                        saveProgress(newProgress);
                        setGameState("ended");
                    }
                }, 2500);

                // Update progress for next question
                setProgress(prev => ({ ...prev, questionStats: updatedStats }));
            }
        }
    };

    const handlePlayAgain = () => {
        initializeGame();
    };

    // Get sorted stats for admin panel
    const getSortedStats = (): { id: string; stats: QuestionStats }[] => {
        const entries = Object.entries(progress.questionStats);
        return entries
            .map(([id, stats]) => ({ id, stats }))
            .sort((a, b) => {
                // Sort by incorrect count first, then by avgTime
                if (b.stats.incorrect !== a.stats.incorrect) {
                    return b.stats.incorrect - a.stats.incorrect;
                }
                return b.stats.avgTime - a.stats.avgTime;
            });
    };

    const togglePattern = (patternId: string) => {
        setSelectedPatterns(prev =>
            prev.includes(patternId)
                ? prev.filter(p => p !== patternId)
                : [...prev, patternId]
        );
    };

    const formatTime = (ms: number): string => {
        if (ms < 1000) return `${Math.round(ms)}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    if (gameState === "loading") {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-3xl font-black text-pink-500">Loading...</div>
            </div>
        );
    }

    if (gameState === "ended") {
        let emoji = "";
        let subtitle = "";
        if (score === TOTAL_QUESTIONS) { emoji = "🏆"; subtitle = "You got every single one right!"; }
        else if (score >= 16) { emoji = "⭐"; subtitle = "You're getting really good at this!"; }
        else if (score >= 12) { emoji = "💜"; subtitle = "Practice makes perfect!"; }
        else { emoji = "🌸"; subtitle = "Keep trying, you're improving!"; }

        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                {/* Admin Panel Overlay */}
                {showAdmin && (
                    <div
                        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                        onClick={() => setShowAdmin(false)}
                    >
                        <div
                            className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-black text-purple-600 mb-4 text-center">📊 Struggling Patterns</h2>

                            {/* Repeat toggle */}
                            <div className="flex items-center justify-between mb-4 p-3 bg-purple-50 rounded-xl">
                                <span className="font-bold text-purple-600">Repeat Difficult Ones</span>
                                <button
                                    onClick={() => setRepeatStruggling(!repeatStruggling)}
                                    className={`w-14 h-8 rounded-full transition-all ${repeatStruggling ? 'bg-purple-500' : 'bg-gray-300'}`}
                                >
                                    <div className={`w-6 h-6 bg-white rounded-full shadow transition-all ${repeatStruggling ? 'translate-x-7' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            {/* Struggling patterns */}
                            <div className="mb-4">
                                <p className="text-sm font-bold text-gray-500 mb-2">Top Struggling Patterns:</p>
                                <div className="space-y-2">
                                    {(progress.strugglingPatterns || []).length === 0 ? (
                                        <p className="text-gray-400 text-sm italic">No struggling patterns yet. Play more to see patterns!</p>
                                    ) : (
                                        (progress.strugglingPatterns || []).map((pattern) => {
                                            const stats = progress.questionStats[pattern];
                                            return (
                                                <div key={pattern} className="flex items-center justify-between p-2 bg-pink-50 rounded-lg">
                                                    <span className="font-bold text-pink-600">{pattern}</span>
                                                    <span className="text-xs text-gray-500">
                                                        {stats?.incorrect || 0} wrong | {formatTime(stats?.avgTime || 0)} avg
                                                    </span>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Individual pattern toggles */}
                            <div className="mb-4">
                                <p className="text-sm font-bold text-gray-500 mb-2">Select Patterns to Repeat:</p>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {getSortedStats().slice(0, 10).map(({ id, stats }) => (
                                        <button
                                            key={id}
                                            onClick={() => togglePattern(id)}
                                            className={`w-full flex items-center justify-between p-2 rounded-lg transition-all ${selectedPatterns.includes(id)
                                                ? 'bg-purple-100 border-2 border-purple-400'
                                                : 'bg-gray-50 border-2 border-transparent'
                                                }`}
                                        >
                                            <span className="font-medium text-gray-700">{id}</span>
                                            <span className="text-xs text-gray-500">
                                                ✓{stats.correct} ✗{stats.incorrect} | {formatTime(stats.avgTime)}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={() => setShowAdmin(false)}
                                className="w-full bg-purple-500 text-white font-bold py-3 rounded-xl hover:bg-purple-600 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}

                <div className="bg-white/90 backdrop-blur-md rounded-[3rem] shadow-[0_20px_60px_rgba(244,63,94,0.15)] p-10 max-w-sm w-full text-center border-4 border-pink-100 animate-bounce-in">
                    <div className="text-7xl mb-3">{emoji}</div>
                    <p className="text-3xl font-black text-pink-600 mb-1">Great job, Aoife!</p>
                    <p className="text-lg text-purple-500 mb-8">{subtitle}</p>
                    <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-2xl p-6 mb-6 border-2 border-pink-100">
                        <p className="text-sm font-bold text-purple-400 uppercase tracking-widest mb-1">Score</p>
                        <p className="text-7xl font-black text-pink-600">
                            {score}<span className="text-3xl text-purple-400"> / {TOTAL_QUESTIONS}</span>
                        </p>
                    </div>
                    <div className="flex justify-center gap-6 text-sm font-bold mb-8">
                        <span className="text-green-500">✓ {progress.totalCorrect} correct</span>
                        <span className="text-pink-400">✗ {progress.totalIncorrect} wrong</span>
                    </div>
                    <div className="space-y-3">
                        <button
                            onClick={handlePlayAgain}
                            className="w-full bg-gradient-to-br from-pink-400 to-purple-500 text-white text-2xl font-black py-4 rounded-2xl border-b-8 border-purple-700 shadow-lg hover:-translate-y-1 active:translate-y-1 active:border-b-2 transition-all duration-100"
                        >
                            Play Again!
                        </button>
                        <button
                            onClick={() => setShowAdmin(true)}
                            className="w-full bg-gray-100 text-gray-600 text-sm font-bold py-2 rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            📊 View Struggling Patterns
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen overflow-hidden flex flex-col items-center justify-between px-8 pt-6 pb-8 touch-manipulation">
            {/* Admin button - small, unobtrusive */}
            <button
                onClick={() => setShowAdmin(true)}
                className="absolute top-4 right-4 text-xs text-gray-400 hover:text-purple-500 transition-colors"
                title="View struggling patterns"
            >
                ⚙️
            </button>

            {/* Admin Panel Overlay */}
            {showAdmin && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={() => setShowAdmin(false)}
                >
                    <div
                        className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-xl font-black text-purple-600 mb-4 text-center">📊 Struggling Patterns</h2>

                        {/* Repeat toggle */}
                        <div className="flex items-center justify-between mb-4 p-3 bg-purple-50 rounded-xl">
                            <span className="font-bold text-purple-600">Repeat Difficult Ones</span>
                            <button
                                onClick={() => setRepeatStruggling(!repeatStruggling)}
                                className={`w-14 h-8 rounded-full transition-all ${repeatStruggling ? 'bg-purple-500' : 'bg-gray-300'}`}
                            >
                                <div className={`w-6 h-6 bg-white rounded-full shadow transition-all ${repeatStruggling ? 'translate-x-7' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        {/* Struggling patterns */}
                        <div className="mb-4">
                            <p className="text-sm font-bold text-gray-500 mb-2">Top Struggling Patterns:</p>
                            <div className="space-y-2">
                                {(progress.strugglingPatterns || []).length === 0 ? (
                                    <p className="text-gray-400 text-sm italic">No struggling patterns yet. Play more to see patterns!</p>
                                ) : (
                                    (progress.strugglingPatterns || []).map((pattern) => {
                                        const stats = progress.questionStats[pattern];
                                        return (
                                            <div key={pattern} className="flex items-center justify-between p-2 bg-pink-50 rounded-lg">
                                                <span className="font-bold text-pink-600">{pattern}</span>
                                                <span className="text-xs text-gray-500">
                                                    {stats?.incorrect || 0} wrong | {formatTime(stats?.avgTime || 0)} avg
                                                </span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Individual pattern toggles */}
                        <div className="mb-4">
                            <p className="text-sm font-bold text-gray-500 mb-2">Select Patterns to Repeat:</p>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {getSortedStats().slice(0, 10).map(({ id, stats }) => (
                                    <button
                                        key={id}
                                        onClick={() => togglePattern(id)}
                                        className={`w-full flex items-center justify-between p-2 rounded-lg transition-all ${selectedPatterns.includes(id)
                                            ? 'bg-purple-100 border-2 border-purple-400'
                                            : 'bg-gray-50 border-2 border-transparent'
                                            }`}
                                    >
                                        <span className="font-medium text-gray-700">{id}</span>
                                        <span className="text-xs text-gray-500">
                                            ✓{stats.correct} ✗{stats.incorrect} | {formatTime(stats.avgTime)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={() => setShowAdmin(false)}
                            className="w-full bg-purple-500 text-white font-bold py-3 rounded-xl hover:bg-purple-600 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* Background blobs */}
            <div className="fixed top-0 left-0 w-72 h-72 bg-pink-300 rounded-full blur-3xl opacity-20 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
            <div className="fixed bottom-0 right-0 w-80 h-80 bg-purple-300 rounded-full blur-3xl opacity-20 translate-x-1/3 translate-y-1/3 pointer-events-none" />
            <div className="fixed top-1/2 right-0 w-48 h-48 bg-blue-200 rounded-full blur-3xl opacity-20 pointer-events-none" />

            {/* ── Progress bar ── */}
            <div className="w-full max-w-2xl flex items-center gap-4">
                <span className="text-pink-500 font-black text-lg tabular-nums whitespace-nowrap">
                    {currentQuestionIndex + 1}<span className="text-pink-300"> / {TOTAL_QUESTIONS}</span>
                </span>
                <div className="flex-1 h-4 bg-white/70 rounded-full overflow-hidden shadow-inner border-2 border-pink-100">
                    <div
                        className="h-full bg-gradient-to-r from-pink-400 via-fuchsia-400 to-purple-400 rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${((currentQuestionIndex + 1) / TOTAL_QUESTIONS) * 100}%` }}
                    />
                </div>
                <span className="text-purple-500 font-black text-lg tabular-nums whitespace-nowrap">{score} ⭐</span>
            </div>

            {/* ── Equation card ── */}
            <div className="w-full max-w-2xl bg-white/85 backdrop-blur-md rounded-3xl shadow-[0_12px_40px_rgba(244,63,94,0.12)] border-4 border-white px-10 py-7">

                {/* One-line equation */}
                <div className="flex items-center justify-center gap-6 mb-5">
                    <span className="text-6xl font-black text-pink-600 tabular-nums tracking-tight drop-shadow-sm">
                        {currentQuestion?.num1}
                    </span>
                    <span className="text-4xl font-black text-blue-400">−</span>
                    <span className="text-6xl font-black text-purple-600 tabular-nums tracking-tight drop-shadow-sm">
                        {currentQuestion?.num2}
                    </span>
                    <span className="text-4xl font-black text-purple-400">=</span>

                    {/* Answer box inline */}
                    <div className={`flex-1 min-w-[160px] rounded-2xl h-[80px] flex items-center justify-center border-[3px] border-dashed transition-all duration-300 ${messageType === "correct" ? "bg-green-50  border-green-300" :
                        messageType === "try-again" ? "bg-amber-50  border-amber-300" :
                            messageType === "show-answer" ? "bg-purple-50 border-purple-300" :
                                "bg-pink-50 border-pink-200"
                        }`}>
                        <span className={`text-5xl font-black leading-none ${messageType === "correct" ? "text-green-600" :
                            messageType === "try-again" ? "text-amber-500" :
                                messageType === "show-answer" ? "text-purple-600" :
                                    displayValue ? "text-pink-600" : "text-pink-300"
                            }`}>
                            {showAnswer ? currentQuestion?.answer : (displayValue || "?")}
                        </span>
                    </div>
                </div>

                {/* Feedback message */}
                {message && (
                    <div className={`w-full py-2.5 px-5 rounded-xl text-sm font-bold text-center animate-bounce-in ${messageType === "correct" ? "bg-green-100 text-green-700" :
                        messageType === "try-again" ? "bg-amber-100 text-amber-700" :
                            "bg-purple-100 text-purple-700"
                        }`}>
                        {message}
                    </div>
                )}
            </div>

            {/* ── Numeric Keypad ── */}
            <div className="w-full max-w-2xl flex flex-col gap-3">
                {gameState === "playing" && (
                    <div className="grid grid-cols-3 gap-2">
                        {/* Row 1: 1, 2, 3 */}
                        <button
                            onClick={() => handleNumberPress(1)}
                            className="btn-numpad py-5"
                        >
                            1
                        </button>
                        <button
                            onClick={() => handleNumberPress(2)}
                            className="btn-numpad py-5"
                        >
                            2
                        </button>
                        <button
                            onClick={() => handleNumberPress(3)}
                            className="btn-numpad py-5"
                        >
                            3
                        </button>

                        {/* Row 2: 4, 5, 6 */}
                        <button
                            onClick={() => handleNumberPress(4)}
                            className="btn-numpad py-5"
                        >
                            4
                        </button>
                        <button
                            onClick={() => handleNumberPress(5)}
                            className="btn-numpad py-5"
                        >
                            5
                        </button>
                        <button
                            onClick={() => handleNumberPress(6)}
                            className="btn-numpad py-5"
                        >
                            6
                        </button>

                        {/* Row 3: 7, 8, 9 */}
                        <button
                            onClick={() => handleNumberPress(7)}
                            className="btn-numpad py-5"
                        >
                            7
                        </button>
                        <button
                            onClick={() => handleNumberPress(8)}
                            className="btn-numpad py-5"
                        >
                            8
                        </button>
                        <button
                            onClick={() => handleNumberPress(9)}
                            className="btn-numpad py-5"
                        >
                            9
                        </button>

                        {/* Row 4: C, 0, Submit */}
                        <button
                            onClick={handleClear}
                            className="btn-numpad btn-numpad-clear py-5"
                        >
                            C
                        </button>
                        <button
                            onClick={() => handleNumberPress(0)}
                            className="btn-numpad py-5"
                        >
                            0
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="btn-numpad btn-numpad-submit py-5 flex items-center justify-center gap-2"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* Attempt dots */}
                <div className="flex justify-center items-center gap-2">
                    {[1, 2].map((i) => (
                        <span key={i} className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${i <= attempt ? 'bg-pink-400' : 'bg-pink-200'}`} />
                    ))}
                    <span className="text-pink-400 font-bold text-xs uppercase tracking-widest ml-2">
                        Try {attempt} of 2
                    </span>
                </div>
            </div>

        </div>
    );
}
