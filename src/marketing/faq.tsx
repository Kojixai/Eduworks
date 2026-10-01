import type { ReactNode } from "react";
import { accessLength, ORDER_MODE } from "@/practice/config";

export interface FaqEntry { q: string; a: ReactNode }

/** Short answers a customer actually wants to read. 8 entries: the page shows them in 2 columns of 4 rows. */
export function faqEntries(): FaqEntry[] {
  const orderA = ORDER_MODE === "required" ? "Yes. You enter it when you sign up." : ORDER_MODE === "optional" ? "It helps, but it is optional." : "No.";
  return [
    { q: "Where do I find my book code?", a: "On the page just inside the front cover of your book. Choose \"Enter your book code\", type it in, and your book unlocks." },
    { q: "How long does access last?", a: `${accessLength()[0].toUpperCase()}${accessLength().slice(1)} from the day you enter your code.` },
    { q: "Can my child sign up on their own?", a: "No. A parent or guardian creates the account, then adds a profile for each child. Children never need an email address." },
    { q: "Do you need my order number?", a: orderA },
    { q: "Is it really free?", a: "Yes. It comes with your book at no extra cost." },
    { q: "Which devices does it work on?", a: "Any phone, tablet or computer with a web browser. There is nothing to install." },
    { q: "What data do you keep?", a: (<>Your name and email, your child&rsquo;s first name and year group, and their practice scores. You can download or delete it all from your Account page. Read our <a href="/privacy">privacy notice</a>.</>) },
    { q: "Is there practice that is not tied to a book?", a: "Yes. Once you are logged in there is free practice for Key Stages 1 to 4, with quizzes, past-paper style questions and phonics and times tables checks." },
  ];
}
