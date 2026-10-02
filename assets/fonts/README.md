# 分享图字体

`NotoSerifSC-SemiBold.subset.woff`：服务端生成分享图（Open Graph、播客封面）用的中文字体。

- 来源：[Noto Serif SC](https://github.com/google/fonts/tree/main/ofl/notoserifsc) 可变字体，SIL Open Font License 1.1（见 `OFL.txt`）
- 处理：字重固定为 600，只保留 GB2312 全部字符、ASCII、Latin-1、常用标点、假名和全角符号（约 9000 字），约 2 MB
- 生成方式：用 [subset-font](https://github.com/papandreou/subset-font)（HarfBuzz）裁剪并固定可变轴

分享图只需要标题等少量文字，GB2312 以外的生僻字会显示为空白方框。
