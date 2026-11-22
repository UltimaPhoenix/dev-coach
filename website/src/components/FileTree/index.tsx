// A directory layout with a short note per entry: where devcoach keeps things, what a release
// archive holds. A figure around a nested list, so a screen reader hears a list of entries.
//
//   import FileTree from "@site/src/components/FileTree";
//
//   <FileTree
//     root="~/.devcoach/"
//     items={[
//       { name: "coaching.db", note: "everything: lessons, profile, settings" },
//       { name: "courses/", note: "one folder per course", children: [
//         { name: "<id>/index.html", note: "the course document" },
//       ] },
//     ]}
//   />
//
// - `root`: the directory the tree starts from, shown on the first line.
// - `items`: `name` (monospace), optional `note` (text or inline JSX), optional `children`.
//   A folder is an item with `children` or a name ending in `/`; it gets a folder icon, a bold name
//   and the word "folder" for screen readers, so it never depends on colour.
// - `caption`: optional sentence under the tree; without one the figure is named after `root`.
// Notes line up in one column when there is room and wrap under their name when there is not.
import type { CSSProperties, ReactNode } from "react";
import styles from "./styles.module.css";

export interface FileTreeItem {
  name: string;
  note?: ReactNode;
  children?: FileTreeItem[];
}

interface Props {
  root: string;
  items: FileTreeItem[];
  caption?: ReactNode;
}

const isFolder = (item: FileTreeItem) => Boolean(item.children?.length) || item.name.endsWith("/");

function Icon({ folder }: { folder: boolean }): ReactNode {
  return folder ? (
    <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M1.75 3.5h4.1l1.5 1.6h6.9v7.4a.75.75 0 0 1-.75.75H1.75a.75.75 0 0 1-.75-.75V4.25a.75.75 0 0 1 .75-.75Z" />
    </svg>
  ) : (
    <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.5 1.75h6l3 3v9.5h-9Z" />
      <path d="M9.5 1.75v3h3" />
    </svg>
  );
}

// The notes' column: as far right as the longest name needs, at its depth (names are monospace,
// so a name of n characters is n `ch` wide). Each level indents by --step.
function noteColumn(items: FileTreeItem[], depth = 0): string[] {
  return items.flatMap((item) => [
    `calc(${depth} * var(--step) + ${Array.from(item.name).length}ch)`,
    ...noteColumn(item.children ?? [], depth + 1),
  ]);
}

function Entries({ items, depth }: { items: FileTreeItem[]; depth: number }): ReactNode {
  return (
    // role="list": Safari drops list semantics from a list styled without bullets.
    <ul className={styles.list} role="list">
      {items.map((item) => {
        const folder = isFolder(item);
        return (
          <li key={item.name} className={styles.item}>
            <div className={styles.entry} style={{ "--depth": depth } as CSSProperties}>
              <span className={folder ? styles.folder : styles.file}>
                <Icon folder={folder} />
                <code className={styles.name}>{item.name}</code>
                {folder && <span className={styles.srOnly}> folder</span>}
              </span>
              {item.note && <span className={styles.note}>{item.note}</span>}
            </div>
            {item.children?.length ? <Entries items={item.children} depth={depth + 1} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

export default function FileTree({ root, items, caption }: Props): ReactNode {
  const column = `max(${noteColumn(items).join(", ")})`;
  return (
    <figure className={styles.tree} aria-label={caption ? undefined : `Files in ${root}`}>
      {/* On the box, where --step is defined: a custom property resolves its var()s where it is set. */}
      <div className={styles.box} style={{ "--names": column } as CSSProperties}>
        <div className={styles.root}>
          <Icon folder />
          <code className={styles.name}>{root}</code>
        </div>
        <Entries items={items} depth={0} />
      </div>
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}
