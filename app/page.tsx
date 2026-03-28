"use client";
import { useState, useEffect, useCallback } from "react";

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
}

interface ProgressData {
    questionStats: Record<string, QuestionStats>;
    totalCorrect: number;
    totalIncorrect: number;
    sessionCount: number;
    lastPlayed: number;
    masteredPatterns: string[];
    strugglingPatterns: string[];
}

type GameState = "loading" | "playing" | "success" | "try-again" | "show-answer" | "ended";

type MessageType = "none" | "try-again" | "correct" | "wrong" | "show-answer";


const generateQuestion = (): Question => {
    // Generate subtraction where num1 is 1-100 and num2 is 1-num1
    // This allows answers from 0 to 99
    const num1 = Math.floor(Math.random() * 100) + 1; // 1-100
    const num2 = Math.floor(Math.random() * num1) + 1; // 1 to num1
    const answer = num1 - num2;

    return { num1, num2, answer, id: `${num1}-${num2}` };
};

const PROGRESS_KEY = "aoife-long-subtraction-progress";

const getDefaultProgress = (): ProgressData => ({
    questionStats: {},
    totalCorrect: 0,
    totalIncorrect: 0,
    sessionCount: 1,
    lastPlayed: Date.now(),
    masteredPatterns: [],
    strugglingPatterns: [],
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

    const loadProgress = useCallback((): ProgressData => {
        try {
            const stored = localStorage.getItem(PROGRESS_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                const dayInMs = 24 * 60 * 60 * 1000;
                if (Date.now() - data.lastPlayed > dayInMs) {
                    data.strugglingPatterns = data.strugglingPatterns.slice(0, 5);
                    data.sessionCount += 1;
                    data.lastPlayed = Date.now();
                    localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
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

    const initializeGame = useCallback(() => {
        const loadedProgress = loadProgress();
        setProgress(loadedProgress);

        // Generate 20 subtraction questions
        const newQuestions: Question[] = [];
        const usedIds = new Set<string>();

        while (newQuestions.length < 20) {
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
    }, [loadProgress]);

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

            setTimeout(() => {
                if (currentQuestionIndex < 19) {
                    setCurrentQuestionIndex((prev) => prev + 1);
                    setUserAnswer(null);
                    setDisplayValue("");
                    setGameState("playing");
                    setMessage("");
                    setMessageType("none");
                    setAttempt(1);
                } else {
                    // Save progress with score
                    const newProgress = { ...progress };
                    newProgress.totalCorrect += score + 1;
                    newProgress.lastPlayed = Date.now();
                    setProgress(newProgress);
                    saveProgress(newProgress);
                    setGameState("ended");
                }
            }, 1500);
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

                setTimeout(() => {
                    if (currentQuestionIndex < 19) {
                        setCurrentQuestionIndex((prev) => prev + 1);
                        setUserAnswer(null);
                        setDisplayValue("");
                        setGameState("playing");
                        setMessage("");
                        setMessageType("none");
                        setAttempt(1);
                        setShowAnswer(false);
                    } else {
                        // Save progress with wrong answer
                        const newProgress = { ...progress };
                        newProgress.totalIncorrect += 1;
                        newProgress.lastPlayed = Date.now();
                        setProgress(newProgress);
                        saveProgress(newProgress);
                        setGameState("ended");
                    }
                }, 2500);
            }
        }
    };

    const handlePlayAgain = () => {
        initializeGame();
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
        if (score === 20) { emoji = "🏆"; subtitle = "You got every single one right!"; }
        else if (score >= 16) { emoji = "⭐"; subtitle = "You're getting really good at this!"; }
        else if (score >= 12) { emoji = "💜"; subtitle = "Practice makes perfect!"; }
        else { emoji = "🌸"; subtitle = "Keep trying, you're improving!"; }

        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="bg-white/90 backdrop-blur-md rounded-[3rem] shadow-[0_20px_60px_rgba(244,63,94,0.15)] p-10 max-w-sm w-full text-center border-4 border-pink-100 animate-bounce-in">
                    <div className="text-7xl mb-3">{emoji}</div>
                    <p className="text-3xl font-black text-pink-600 mb-1">Great job, Aoife!</p>
                    <p className="text-lg text-purple-500 mb-8">{subtitle}</p>
                    <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-2xl p-6 mb-6 border-2 border-pink-100">
                        <p className="text-sm font-bold text-purple-400 uppercase tracking-widest mb-1">Score</p>
                        <p className="text-7xl font-black text-pink-600">
                            {score}<span className="text-3xl text-purple-400"> / 20</span>
                        </p>
                    </div>
                    <div className="flex justify-center gap-6 text-sm font-bold mb-8">
                        <span className="text-green-500">✓ {progress.totalCorrect} correct</span>
                        <span className="text-pink-400">✗ {progress.totalIncorrect} wrong</span>
                    </div>
                    <button
                        onClick={handlePlayAgain}
                        className="w-full bg-gradient-to-br from-pink-400 to-purple-500 text-white text-2xl font-black py-4 rounded-2xl border-b-8 border-purple-700 shadow-lg hover:-translate-y-1 active:translate-y-1 active:border-b-2 transition-all duration-100"
                    >
                        Play Again!
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen overflow-hidden flex flex-col items-center justify-between px-8 pt-6 pb-8 touch-manipulation">
            {/* Background blobs */}
            <div className="fixed top-0 left-0 w-72 h-72 bg-pink-300 rounded-full blur-3xl opacity-20 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
            <div className="fixed bottom-0 right-0 w-80 h-80 bg-purple-300 rounded-full blur-3xl opacity-20 translate-x-1/3 translate-y-1/3 pointer-events-none" />
            <div className="fixed top-1/2 right-0 w-48 h-48 bg-blue-200 rounded-full blur-3xl opacity-20 pointer-events-none" />

            {/* ── Progress bar ── */}
            <div className="w-full max-w-2xl flex items-center gap-4">
                <span className="text-pink-500 font-black text-lg tabular-nums whitespace-nowrap">
                    {currentQuestionIndex + 1}<span className="text-pink-300"> / 20</span>
                </span>
                <div className="flex-1 h-4 bg-white/70 rounded-full overflow-hidden shadow-inner border-2 border-pink-100">
                    <div
                        className="h-full bg-gradient-to-r from-pink-400 via-fuchsia-400 to-purple-400 rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${((currentQuestionIndex + 1) / 20) * 100}%` }}
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
