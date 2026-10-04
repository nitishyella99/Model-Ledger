"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import {
  Bot,
  CheckCircle2,
  Download,
  FileText,
  Send,
  UserRound,
} from "lucide-react";
import type {
  GenerateTestCasesActionResult,
  generateTestCasesAction,
} from "@/app/test-case-generator/actions";
import { testCaseCountOptions } from "@/lib/test-case-generator/processor";
import type { GeneratedTestCase } from "@/lib/test-case-generator/types";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  questions?: string[];
  cases?: GeneratedTestCase[];
  fileHref?: string;
  error?: boolean;
};

type TestCaseGeneratorProps = Readonly<{
  action: typeof generateTestCasesAction;
}>;

function createDownloadHref(csv: string) {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

export function TestCaseGenerator({ action }: TestCaseGeneratorProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [testCaseCount, setTestCaseCount] = useState(8);
  const [modelContext, setModelContext] = useState("");
  const [needsContext, setNeedsContext] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const hasMessages = messages.length > 0;
  const conversationEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ block: "end" });
  }, [messages, isPending]);

  function appendResult(result: GenerateTestCasesActionResult) {
    if (result.status === "error") {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: result.message,
          error: true,
        },
      ]);
      return;
    }

    if (result.status === "needs_context") {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-context-${Date.now()}`,
          role: "assistant",
          content: result.message,
          questions: result.questions,
        },
      ]);
      setModelContext(result.modelContext);
      setNeedsContext(true);
      setClarificationQuestions(result.questions);
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: `assistant-success-${Date.now()}`,
        role: "assistant",
        content: result.message,
        cases: result.cases,
        fileHref: createDownloadHref(result.csv),
      },
    ]);
    setModelContext(result.modelContext);
    setNeedsContext(false);
    setClarificationQuestions([]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedDraft = draft.trim();

    if (!trimmedDraft || isPending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmedDraft,
    };

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    startTransition(async () => {
      try {
        const result = await action({
          modelContext,
          message: trimmedDraft,
          testCaseCount,
          clarificationQuestions,
        });

        appendResult(result);
        if (result.status === "error") setDraft(trimmedDraft);
      } catch {
        appendResult({ status: "error", message: "Could not reach the test generator. Please try again." });
        setDraft(trimmedDraft);
      }
    });
  }

  return (
    <main className="flex h-[calc(100dvh-8rem)] min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">
        {!hasMessages ? (
          <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center pb-20 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-stone-950 sm:text-3xl">
              Generate test cases for your model
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-stone-600">
              Describe your application&apos;s tasks, rules, input and output format,
              and any examples or known failures. I will clarify missing details
              and generate specific test inputs with draft expected behavior and
              pass/fail criteria for your review.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-8 pb-28 pt-2">
            <h1 className="text-sm font-semibold text-stone-500">
              Conversation
            </h1>
            {messages.map((message) => (
              <div
                key={message.id}
                className={[
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start",
                ].join(" ")}
              >
                {message.role === "assistant" ? (
                  <div className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600">
                    <Bot className="size-4" strokeWidth={1.8} aria-hidden="true" />
                  </div>
                ) : null}

                <div
                  className={[
                    "max-w-[760px] text-sm leading-6",
                    message.role === "user"
                      ? "rounded-2xl bg-stone-950 px-4 py-3 text-white"
                      : message.error
                        ? "text-rose-700"
                        : "text-stone-700",
                  ].join(" ")}
                >
                  <p>{message.content}</p>

                  {message.questions ? (
                    <div className="mt-4 space-y-2">
                      {message.questions.map((question) => (
                        <div
                          key={question}
                          className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"
                        >
                          <CheckCircle2
                            className="mt-0.5 size-4 shrink-0"
                            strokeWidth={1.8}
                            aria-hidden="true"
                          />
                          <span>{question}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {message.fileHref ? (
                    <a
                      href={message.fileHref}
                      download="modelledger-generated-test-cases.csv"
                      className="mt-4 flex w-full items-center gap-3 rounded-md border border-stone-200 bg-white p-3 text-stone-800 transition-colors hover:bg-stone-50 sm:w-[360px]"
                    >
                      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-600">
                        <FileText className="size-5" strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          modelledger-generated-test-cases.csv
                        </span>
                        <span className="block text-xs text-stone-500">
                          CSV file
                        </span>
                      </span>
                      <Download className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                    </a>
                  ) : null}

                  {message.cases ? (
                    <div className="mt-4 divide-y divide-stone-200 overflow-hidden rounded-md border border-stone-200 bg-white">
                      {message.cases.map((testCase) => (
                        <article key={testCase.testId} className="p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <h3 className="font-semibold text-stone-950">
                                {testCase.testId}: {testCase.name}
                              </h3>
                              <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-stone-500">
                                {testCase.category}
                              </p>
                            </div>
                            <span className="inline-flex h-7 w-fit items-center rounded-md border border-stone-200 px-2 text-xs font-semibold text-stone-600">
                              {testCase.difficulty}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-stone-500">Objective: {testCase.testingObjective}</p>
                          <p className="mt-3 whitespace-pre-wrap text-stone-700">{testCase.prompt}</p>
                          <div className="mt-3 space-y-2 border-t border-stone-100 pt-3">
                            <p className="text-xs font-semibold text-amber-700">Draft expectations — review before evaluation</p>
                            <p><span className="font-medium">Expected behavior: </span>{testCase.expectedBehavior}</p>
                            <p className="text-xs font-semibold">Pass criteria</p>
                            <ul className="list-disc space-y-1 pl-5">{testCase.passCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul>
                            <p className="text-xs font-semibold">Fail criteria</p>
                            <ul className="list-disc space-y-1 pl-5">{testCase.failCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </div>

                {message.role === "user" ? (
                  <div className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-stone-950 text-white">
                    <UserRound className="size-4" strokeWidth={1.8} aria-hidden="true" />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <div ref={conversationEnd} />
      </div>

      <form onSubmit={handleSubmit} className="shrink-0 px-4 pb-1">
        <div className="mx-auto max-w-3xl rounded-2xl border border-stone-200 bg-white p-2.5 shadow-[0_20px_45px_-28px_rgba(28,25,23,0.45)]">
          <label className="sr-only" htmlFor="test-case-generator-input">
            {needsContext ? "Add the missing context" : "Ask anything"}
          </label>
          <div className="grid gap-3">
            <textarea
              id="test-case-generator-input"
              value={draft}
              disabled={isPending}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              placeholder={
                needsContext
                  ? "Example: Our users are support agents. Success means citing policy and escalating refund exceptions. The model must avoid exposing private account data."
                  : "Describe tasks, rules, input/output format, examples, and failures to test..."
              }
              className="max-h-28 min-h-14 resize-none border-none bg-transparent px-1 py-1 text-sm leading-6 text-stone-800 outline-none placeholder:text-stone-400"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 px-1 text-xs text-stone-500">
                <Bot className="size-4" strokeWidth={1.8} aria-hidden="true" />
                AI test generator
              </div>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="test-case-count">
                  Number of test cases
                </label>
                <select
                  id="test-case-count"
                  value={testCaseCount}
                  disabled={isPending}
                  onChange={(event) => setTestCaseCount(Number(event.target.value))}
                  className="h-9 rounded-md border border-stone-200 bg-white px-2 text-xs font-semibold text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                >
                  {testCaseCountOptions.map((count) => (
                    <option key={count} value={count}>
                      {count} cases
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={isPending || !draft.trim()}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 active:translate-y-px"
                >
                  {isPending ? "Working" : needsContext ? "Generate" : "Send"}
                  <Send className="size-4" strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </main>
  );
}
