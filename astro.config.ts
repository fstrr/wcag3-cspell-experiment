import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import fg from "fast-glob";
import difference from "lodash-es/difference";
import { remarkDefinitionList, defListHastHandlers } from "remark-definition-list";
import remarkDirective from "remark-directive";

import { readFile } from "fs/promises";
import { basename, dirname, join } from "path";

import { guidelinesRehypePlugins, guidelinesRemarkPlugins } from "./src/lib/markdown/guidelines";

// https://astro.build/config
export default defineConfig({
  adapter: node({
    mode: "standalone",
  }),
  devToolbar: { enabled: false },
  trailingSlash: "always",
  markdown: {
    remarkPlugins: [remarkDirective, remarkDefinitionList, ...guidelinesRemarkPlugins],
    rehypePlugins: [...guidelinesRehypePlugins],
    remarkRehype: {
      // https://github.com/wataru-chocola/remark-definition-list/issues/50#issuecomment-1445130314
      handlers: { ...defListHastHandlers },
    },
  },
  experimental: {
    contentIntellisense: true,
    preserveScriptOrder: true,
  },
  integrations: [
    {
      /** Checks for mismatched children array vs. subdirectory contents */
      name: "children-check",
      hooks: {
        "astro:build:start": async () => {
          const getUniqueEntries = (array1: any[], array2: any[]) =>
            (array1.length > array2.length
              ? difference(array1, array2)
              : difference(array2, array1)
            ).join(", ");

          const groupsPath = join("guidelines", "groups");
          const groupIds = (
            await fg.glob("*.json", {
              cwd: groupsPath,
              ignore: ["index.json"],
            })
          ).map((filename) => basename(filename, ".json"));

          // Check at group level (index.json -> *.json)
          const topLevelChildren = JSON.parse(
            await readFile(join(groupsPath, "index.json"), "utf8")
          );
          if (topLevelChildren.length !== groupIds.length) {
            throw new Error(
              `groups/index.json lists ${topLevelChildren.length} children but there are ${
                groupIds.length
              } files (check: ${getUniqueEntries(topLevelChildren, groupIds)})`
            );
          }

          // Check at group->guideline level (*.json -> */*.md)
          for (const id of groupIds) {
            const data = JSON.parse(await readFile(join(groupsPath, `${id}.json`), "utf8"));

            const actualFiles = (await fg.glob("*.md", { cwd: join(groupsPath, id) })).map(
              (filename) => basename(filename, ".md")
            );
            if (data.children.length !== actualFiles.length) {
              throw new Error(
                `groups/${id}.json lists ${data.children.length} children but groups/${id}/ contains ${
                  actualFiles.length
                } files (check: ${getUniqueEntries(actualFiles, data.children)})`
              );
            }
          }

          // Check at guideline level (*/*.md -> */*/*.md)
          for (const filename of await fg.glob(join(groupsPath, "*", "*.md"))) {
            const id = join(basename(dirname(filename)), basename(filename, ".md"));
            const data = parseFrontmatter(await readFile(filename, "utf8")).frontmatter;

            const actualFiles = (await fg.glob("*.md", { cwd: join(groupsPath, id) })).map(
              (filename) => basename(filename, ".md")
            );
            if (data.children.length !== actualFiles.length) {
              throw new Error(
                `groups/${id}.md lists ${data.children.length} children but groups/${id}/ contains ${
                  actualFiles.length
                } files (check: ${getUniqueEntries(actualFiles, data.children)})`
              );
            }
          }
        },
      },
    },
  ],
});
