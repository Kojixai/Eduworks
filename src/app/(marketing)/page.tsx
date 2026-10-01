import { currentParent } from "@/lib/auth";
import { loadBooks } from "@/marketing/books";
import { SiteFooter } from "@/marketing/Footer";
import { SiteNav } from "@/marketing/Nav";
import { BigWords, Books, Cta, Explore, Faq, Features, Hero, HowItWorks, OurPromise, Statement, TopicGives, WhoFor } from "@/marketing/Sections";

// Depends on who is looking (logged in or not) and on the live book list.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [data, parent] = await Promise.all([loadBooks(), currentParent()]);
  return (
    <>
      <a className="ip-skip-link" href="#main">Skip to the main content</a>
      <SiteNav loggedIn={!!parent && !parent.is_preview} />
      <main id="main">
        <Hero />
        <Statement />
        <HowItWorks />
        <Books data={data} />
        <Features />
        <WhoFor />
        <TopicGives />
        <OurPromise />
        <Explore bookCount={data.books.length} />
        <BigWords />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </>
  );
}
