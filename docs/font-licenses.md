# 字体使用与分发核查

当前实现只保存字体名称，并调用用户本机已安装的字体。没有增加字体下载、字体文件、字体转换或打包字体；其他主题也使用同一终端字体设置。

| 字体 | 核查依据 | 当前功能的使用方式 |
| --- | --- | --- |
| Cascadia Code / Cascadia Mono | [Microsoft 官方 OFL 1.1](https://github.com/microsoft/cascadia-code/blob/main/LICENSE) | 调用本机字体；可以按许可条件分发，当前不分发 |
| Noto Sans SC | [Google Fonts 官方 OFL 1.1](https://github.com/google/fonts/blob/main/ofl/notosanssc/OFL.txt) | 调用本机字体；没有安装时沿用原有后备字体 |
| JetBrains Mono（输入建议） | [JetBrains 官方 OFL](https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt) | 仅建议字体名称，不下载或附带文件 |
| Consolas、Microsoft YaHei UI、Microsoft YaHei | [Microsoft 字体使用与分发 FAQ](https://learn.microsoft.com/en-us/typography/fonts/font-faq) | 应用可以使用 Windows 已安装字体显示和编辑内容；未将系统字体复制到安装包 |
| DejaVu Sans Mono（附加后备） | [DejaVu 官方许可](https://github.com/dejavu-fonts/dejavu-fonts/blob/master/LICENSE) | 仅按名称调用本机字体，不附带文件 |
| Liberation Mono（附加后备） | [Liberation Fonts 官方许可](https://github.com/liberationfonts/liberation-fonts/blob/main/LICENSE) | 仅按名称调用本机字体，不附带文件 |
| SF Mono、Menlo、PingFang SC | 上游已有的 macOS 字体后备顺序 | 继续按名称调用本机已有字体，不新增、转换或跨系统分发文件 |

本机实际使用的 CascadiaCode.ttf 与 NotoSansSC-VF.ttf 的 OpenType name 表均含 OFL 许可描述与许可网址。[验证摘要](appearance-evidence.json)记录了文件哈希与许可元数据检查结果，未复制字体文件到仓库。该核查支持上述已知字体的当前调用方式；自定义字体名称不构成对任意第三方字体许可的保证，仍以该字体的实际授权为准。

如未来决定附带 OFL 字体文件，应同时包含版权声明和完整许可，并遵守保留名称等条件。Windows 专有系统字体的本机调用许可不等于允许随应用分发；当前功能不走这条分发路径。

测试包括实际字体识别、未安装字体回退、所有六套主题下的 GPU/DOM 字体适配、切换与重启，以及字体网络请求检查。安装包另查字体扩展名与资源清单。