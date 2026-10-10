# M4 因子研究台

这是因子研究台的业务前端，提供数据管理、因子单项和批量计算、研究证据查看及策略回测。

## 启动

推荐从后端项目根目录启动完整本地服务：

```powershell
cd D:\futures_quant_strategy
.\run.ps1
```

该脚本会启动因子 API、策略 API、数据 API 和前端。只需单独启动前端时：

```powershell
cd E:\codex\Agent\quant_stock_strategy_system\frontEnd
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:8872`。后端默认地址为 `http://127.0.0.1:8771/api/v1`，可通过 `VITE_M4_API_URL` 修改。
