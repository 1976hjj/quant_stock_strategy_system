# M4 因子研究台

这是一个面向任意 Factor Release 的 M4 控制界面，不与当前 13 个因子绑定。

## 启动

先启动后端：

```powershell
cd D:\futures_quant_strategy
.\scripts\start_m4_control_api.ps1
```

再启动前端：

```powershell
cd E:\codex\Agent\quant\_stock\_strategy\_system\frontEnd
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:8872`。后端默认地址为 `http://127.0.0.1:8771/api/v1`，可通过 `VITE_M4_API_URL` 修改。
