# 气泡代码来源

来源：DeepSeek Balance Whale Widget，作者 MeteorNOX。

固定版本：5247dd6813d6e4430728f39ccc63d43cda046022

源码：https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/blob/5247dd6813d6e4430728f39ccc63d43cda046022/assets/whale-widget.js

直接摘取原项目的 FRAME_CLASSIC_MARKUP（路径及两个椭圆）、气泡及文字显示样式和分阶段过渡时序，分别保存在 web/src/pet-bubble/upstream.svg 和 upstream.css。保留原始类名、坐标和延迟。MN 侧只负责挂载到桌宠原比例对应的位置、传入倒计时文字、处理生命周期；没有引入余额、音效、轮播或其他模块。下方内容区留空。

许可：MIT，完整原文见本目录 LICENSE。该许可适用于复用部分，不代表 MN Pet 其余代码整体采用 MIT。
