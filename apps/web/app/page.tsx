import {
  ArrowRight,
  Check,
  FileCheck2,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const rules = ["Fits your space", "Meets your specs", "Stays in your budget"];
export default function Home() {
  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="tiny-line" /> A considered way to shop
          </p>
          <h1>
            A little less guesswork.
            <br />A little more <em>certain.</em>
          </h1>
          <p className="hero-description">
            Your money should follow your rules. Put what matters on paper,
            check the evidence, and know exactly what you’re approving.
          </p>
          <div className="hero-actions">
            <Button asChild>
              <Link href="/workspace">
                Open your workspace <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </Button>
            <a href="#how-it-works" className="text-link">
              Read the fine print <span aria-hidden="true">↗</span>
            </a>
          </div>
          <p className="hero-footnote">
            Your requirements. Your approval. Every time.
          </p>
        </div>
        <div className="document-scene">
          <div className="document-caption">
            <span>01 / THE PURCHASE, ON PAPER</span>
            <span>EXAMPLE</span>
          </div>
          <article
            className="purchase-sheet"
            aria-label="Illustrative purchase brief"
          >
            <div className="sheet-top">
              <FileCheck2 size={24} strokeWidth={1.5} aria-hidden="true" />
              <span>THE CONSIDERED PURCHASE</span>
              <span className="sheet-number">No. 001</span>
            </div>
            <h2>
              A home office.
              <br />
              On your terms.
            </h2>
            <p className="document-quote">
              “Under $1,000. A desk that fits.
              <br />A monitor that charges my laptop.”
            </p>
            <div className="rule-list">
              {rules.map((rule, index) => (
                <div className="rule-line" key={rule}>
                  <span className="rule-number">0{index + 1}</span>
                  <span>{rule}</span>
                  <Check size={18} aria-label="Example check" />
                </div>
              ))}
            </div>
            <div className="document-note">
              <span className="note-label">THE PROMISE</span>
              <p>
                If the purchase changes,
                <br />
                <strong>your approval should, too.</strong>
              </p>
              <ShieldCheck size={35} strokeWidth={1.3} aria-hidden="true" />
            </div>
            <p className="sheet-disclaimer">
              Illustration only · No purchase or payment created
            </p>
          </article>
          <span className="scene-note">
            Good decisions deserve a paper trail.
          </span>
        </div>
      </section>
      <section id="how-it-works" className="how-section">
        <div className="section-heading">
          <p className="eyebrow">Nothing hidden between the lines</p>
          <h2>From “I need” to “I approve.”</h2>
          <p>The approach behind Cartel.</p>
        </div>
        <div className="steps">
          {[
            {
              number: "01",
              icon: ListChecks,
              title: "Write the rules.",
              body: "A budget, a dimension, a deadline. Turn what matters into clear requirements.",
            },
            {
              number: "02",
              icon: FileCheck2,
              title: "Ask for the evidence.",
              body: "See who says what. Keep confirmed facts, estimates, and unknowns separate.",
            },
            {
              number: "03",
              icon: ShieldCheck,
              title: "Keep your say.",
              body: "Approve an exact purchase. Re-check changes before any money moves.",
            },
          ].map(({ number, icon: Icon, title, body }) => (
            <article className="step" key={number}>
              <div className="step-top">
                <span>{number}</span>
                <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
