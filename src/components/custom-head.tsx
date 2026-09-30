import type { Element, Root } from "hast";
import { fromHtml } from "hast-util-from-html";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

const ALLOWED = new Set(["script", "meta", "link", "style", "noscript", "base"]);

/** 把后台填写的 <head> 代码（统计脚本、站点验证等）转换成 React 元素 */
export function CustomHead({ html }: { html: string }) {
  if (!html.trim()) return null;
  const tree = fromHtml(html, { fragment: true });
  const root: Root = {
    type: "root",
    children: tree.children.filter(
      (n): n is Element => n.type === "element" && ALLOWED.has(n.tagName),
    ),
  };
  return toJsxRuntime(root, {
    Fragment,
    jsx,
    jsxs,
    components: {
      script: ({ children, ...props }) => {
        const code = typeof children === "string" ? children : "";
        return code ? (
          <script {...props} dangerouslySetInnerHTML={{ __html: code }} />
        ) : (
          <script {...props} />
        );
      },
      style: ({ children, ...props }) => (
        <style
          {...props}
          dangerouslySetInnerHTML={{ __html: typeof children === "string" ? children : "" }}
        />
      ),
    },
    passNode: false,
  });
}
