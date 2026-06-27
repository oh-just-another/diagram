import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import CodeBlock from "@theme/CodeBlock";
import styles from "./styles.module.css";

const GITHUB_URL = "https://github.com/oh-just-another/diagram";

/**
 * Landing hero: wordmark, one-line pitch, two CTAs, and the install snippet.
 * Deliberately compact — the live editor and usage sections follow below it.
 */
export default function Hero(): ReactNode {
  return (
    <header className={styles.hero}>
      <h1 className={styles.title}>diagram</h1>
      <p className={styles.tagline}>
        A drop-in infinite-canvas diagram editor for React — it auto-detects the best renderer, is
        driveable from code, and is MIT-licensed with no license key.
      </p>
      <div className={styles.actions}>
        <Link className={`${styles.btn} ${styles.btnPrimary}`} to="#mount-it">
          Get started
        </Link>
        <Link className={`${styles.btn} ${styles.btnSecondary}`} to={GITHUB_URL}>
          GitHub
        </Link>
      </div>
      <div className={styles.install}>
        <CodeBlock language="bash">pnpm add @oh-just-another/editor</CodeBlock>
      </div>
    </header>
  );
}
