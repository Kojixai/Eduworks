import type { ReactNode } from "react";
import { accessLength, ORDER_MODE } from "@/practice/config";
import { PUBLISHER } from "./brand";

export interface FaqEntry { q: string; a: ReactNode }

function orderAnswer(): string {
  const how = "We only check that it looks like an order number, we never check it with Amazon, we keep it scrambled so it cannot be read back, and we delete it when your access ends.";
  if (ORDER_MODE === "off") return "No. We do not ask for it.";
  if (ORDER_MODE === "required") return `We ask for it when you enter your code. ${how}`;
  return `It is optional. ${how}`;
}

export function faqEntries(): FaqEntry[] {
  const length = accessLength();
  return [
    { q: "Where do I find my book code?", a: `On a page just inside the front cover of your ${PUBLISHER} book. Choose "Enter your book code" on this page, type it in, and that book's online practice unlocks.` },
    { q: "How long does access last?", a: `Each code unlocks 1 book for ${length} from the day you enter it.` },
    { q: "Can my child sign up on their own?", a: "An adult (a parent, guardian or teacher) creates the account and adds a simple profile for each child: a first name and a year group, nothing else. Children never need an email address. Students aged 13 and over can have their own account for the KS3 and GCSE books." },
    { q: "Do you need my Amazon order number?", a: orderAnswer() },
    { q: "Is it really free with the book?", a: `Yes. Your code unlocks the book's online practice at no extra cost, for ${length} from the day you enter it. There are no adverts, and nothing is sold.` },
    { q: "Which devices does it work on?", a: "Any phone, tablet or computer with a web browser. There is nothing to install." },
    { q: "What data do you keep, and how do I delete it?", a: (<>We keep what the service needs: the adult&rsquo;s account, a first name and year group for each child, and their practice results so the dashboard can show progress. There are no adverts, no chat and no trackers, and nothing is sold. Once you are logged in, the Account page lets you download everything we hold or delete the account. More detail is on the <a href="/privacy">privacy page</a>.</>) },
    { q: "Is there practice that is not tied to a book?", a: "Yes. Once you are logged in there is free curriculum practice for Key Stages 1 to 4: lessons, quizzes, past-paper style practice, phonics screening check practice and times tables check practice. It is built from open data from Oak National Academy and the Standards and Testing Agency, under the Open Government Licence." },
  ];
}
