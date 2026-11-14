import { getLang, type Lang } from "../../i18n";
import type { Block, DocPage } from "./types";

function blockMarkdown(block: Block, lang: Lang): string {
  switch (block.type) {
    case "h2":
      return `## ${block.text}`;
    case "h3":
      return `### ${block.text}`;
    case "p":
      return block.text;
    case "ul":
      return block.items.map((item) => `- ${item}`).join("\n");
    case "callout":
      return `> **${block.title}**\n>\n> ${block.text}`;
    case "steps":
      return block.items.map((item, index) => `${index + 1}. **${item.title}** ${item.text}`).join("\n");
    case "code":
      return block.tabs.map((tab) => `\`\`\`${tab.lang}\n${tab.code}\n\`\`\``).join("\n\n");
    case "params":
      return block.rows
        .map((row) => `- \`${row.name}\` \`${row.type}\`${row.required ? (lang === "en" ? " Required" : " 必填") : ""}${lang === "en" ? ": " : "："}${row.text}`)
        .join("\n");
    case "cards":
      return block.items.map((item) => `- [${item.title}](${item.to})${lang === "en" ? ": " : "："}${item.text}`).join("\n");
    default:
      return "";
  }
}

export function pageMarkdown(page: DocPage, lang: Lang = getLang()): string {
  const body = page.blocks.map((block) => blockMarkdown(block, lang)).filter(Boolean).join("\n\n");
  return `# ${page.title}\n\n${page.lead}\n\n${body}\n`;
}
