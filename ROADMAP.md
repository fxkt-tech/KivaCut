### Timeline剩余功能
- [x] 碰撞检测：任意两段Clip在同一个轨道中不能重叠，否则拖拽失败
- [x] 删除Clip时，如果当前Track已经为空了，那就删除当前Track
- [x] 不同的Track类型可以包含的Clip类型不一样
    - [x] Video Track可以包含Video Clip和Image Clip
    - [x] Audio Track仅可以包含Audio Clip
- [x] Clip支持分割
    
### 时间线播放器
- [x] 支持播放图片
- [x] 支持播放音频
- [x] 时间格式中，毫秒转化为帧显示
- [x] bug：修复png判断为video素材的情况
- [x] bug：修复Player和Timeline中的上一帧下一帧功能不一致问题
- [x] bug：点击素材时，最右侧属性没有正确渲染
- [ ] bug：长时长视频时，ruler定位无法渲染指针
