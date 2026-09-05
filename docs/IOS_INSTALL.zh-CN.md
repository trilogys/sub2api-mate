# GateNest iOS 16+ 签名与安装

## 安装包

- 文件：`gatenest-v1.8.3.ipa`（文件名版本随构建更新）。
- 设备：iOS / iPadOS 16.0 及以上的 arm64 iPhone、iPad。
- 应用名称：GateNest。
- 默认 Bundle ID：`com.ppx.sub2apimate`。
- 类型：真机 Release 包，已包含运行所需的 JavaScript、图标和原生模块，不需要 Expo Go 或 Metro。
- 签名状态：未签名，必须签名后才能安装。文件名只保留应用名称和版本。

iOS 与 Android 使用同一套业务代码，保留 Sub2API、CLIProxyAPI、账号管理、分组、配额、日志、AI 助手、导入导出和 GitHub 构建等功能。Android 的 APK 自动安装属于系统专用功能，iOS 的原生升级通过下载新 IPA、重新签名安装完成。

## 获取 IPA

1. 打开 [GateNest iOS IPA 工作流](https://github.com/trilogys/GateNest/actions/workflows/ios-native-build.yml)。
2. 单独测试可选择包含该工作流的分支并运行；正式版本由 **GateNest Android and iOS Release** 同时构建并发布 Android 和 iOS。
3. 构建成功后下载 `gatenest-vX.Y.Z` Artifact 并解压。
4. 取出 `.ipa` 文件。Artifact 外层 ZIP 不是 IPA，不要把 ZIP 改后缀后安装。

同一 Artifact 中的 `.sha256` 可用于校验下载，`ios-verification.json` 记录编译产物的版本、架构、最低系统和源提交。

## 准备签名材料

需要包含私钥的 `.p12`、该 P12 的导入密码，以及与证书、应用标识和安装设备匹配的 `.mobileprovision` 描述文件。

P12 是证书与私钥的打包格式。全能签、爱思助手可以使用已有 P12 对 IPA 签名，但不能凭空签发有效的 Apple 开发者证书。只有 `.cer`、没有对应私钥时，也无法得到可用的 P12。若已有 Apple Developer 证书，应从生成私钥的 Mac 钥匙串导出 P12，并在开发者账户中生成相应描述文件。

使用 Development / Ad Hoc 描述文件时，需要包含目标设备的 UDID。描述文件中的 App ID 必须允许 IPA 的 Bundle ID；若工具根据证书调整 Bundle ID，后续升级应保持相同标识及签名团队，以尽量保留应用数据和钥匙串访问权限。

## 全能签（ESign）

1. 将 P12、描述文件和 IPA 导入全能签。
2. 导入证书，输入 P12 密码，确认描述文件与证书匹配。
3. 选择 GateNest IPA，进入签名操作，选择上述证书和描述文件。
4. 保留应用名称 GateNest。Bundle ID 与描述文件匹配时保持默认值。
5. 完成签名后安装生成的已签名 IPA，按系统提示进行必要的信任或开发者模式设置。

## 爱思助手

1. 用数据线连接 iPhone / iPad，解锁设备并信任电脑。
2. 在支持证书签名的爱思助手版本中打开 IPA 签名工具，添加 GateNest IPA。
3. 选择证书签名，导入 P12、输入密码并选择匹配的描述文件。具体入口名称以安装版本为准。
4. 签名完成后，将输出的已签名 IPA 安装到已连接设备。
5. 如果设备提示需要开发者模式，在“设置 → 隐私与安全性 → 开发者模式”中开启并按提示重启。企业证书的信任设置按系统提示处理。

## 首次打开与验证

后续在“关于应用”中检查 GitHub Release。有 IPA 附件时可以点击“下载 IPA”，下载完成会打开系统分享菜单。选择已安装且支持导入 IPA 的签名 App，或存储到“文件”后从签名工具导入；再次点击“选择签名 App”可以重新打开分享菜单，不必重复下载。分享完成不等于已签名或已安装，需要在签名工具内完成操作。爱思助手的电脑端签名流程仍需将文件传到电脑。

Expo 在线更新是另一个入口，只能接收维护者已发布、与当前原生版本匹配的 JavaScript 和资源更新。GitHub 上传 IPA 不会自动发布 Expo 在线更新；原生安装包仍需签名安装。

输入原来使用的服务端地址与凭据即可。访问局域网服务器时，需要允许 GateNest 的本地网络权限；拒绝后可以在系统设置中重新开启。项目允许连接用户自行配置的 HTTP 服务端，仍建议优先使用 HTTPS。

构建检查覆盖真机架构、iOS 16 最低系统、应用身份与包内 JavaScript，不等于已完成真机测试。安装后应验证登录、切换工作区、页面导航、剪贴板、文件导入导出、AI 请求及重启后的配置保存。

若安装报完整性或验证错误，先检查证书是否有效、描述文件是否包含设备、Bundle ID 是否匹配，以及安装的是否是已签名输出文件。P12、密码、描述文件不需要上传到本仓库或 GitHub Actions。
