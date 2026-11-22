// A message exactly as it appears on the reader's screen, so that searching the page for the text
// they see finds it. Long one-line messages wrap here, where a code block would scroll sideways.
//
//   import Message from "@site/src/components/Message";
//
//   <Message where="A devcoach command, or Claude Desktop's log" text="devcoach 2.7.1 needs Node 24 …" />
//
// - `where`: where the reader sees it, shown above the text (plain text or inline JSX).
// - `text`: the message itself, character for character (a prop, so MDX leaves backticks alone).
import type { ReactNode } from "react";
import styles from "./styles.module.css";

interface Props {
  where: ReactNode;
  text: string;
}

export default function Message({ where, text }: Props): ReactNode {
  return (
    <figure className={styles.message}>
      <figcaption className={styles.where}>{where}</figcaption>
      <samp className={styles.text}>{text}</samp>
    </figure>
  );
}
