/* 薪水成果卡:用 canvas 繪製,預設不含時薪、公司名稱等敏感資料。 */
window.ShareCard = (function () {
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * data: { dateText, amountText|null, workedText, lines: [{label,value}] }
   * 只接收「已格式化的顯示文字」,不會碰到時薪等原始設定。
   */
  function draw(canvas, data) {
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d');
    const font = '"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif';

    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1b1e29'); g.addColorStop(1, '#2b2140');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb020'; ctx.font = `700 54px ${font}`;
    ctx.fillText('🐂 今日牛馬成果', W / 2, 120);
    ctx.fillStyle = '#9aa1b2'; ctx.font = `400 32px ${font}`;
    ctx.fillText(data.dateText, W / 2, 170);

    ctx.fillStyle = '#9aa1b2'; ctx.font = `400 34px ${font}`;
    ctx.fillText('今天累積薪資', W / 2, 290);
    ctx.fillStyle = '#ffffff'; ctx.font = `800 ${data.amountText ? 120 : 90}px ${font}`;
    ctx.fillText(data.amountText || '＊＊＊', W / 2, 410);
    ctx.fillStyle = '#9aa1b2'; ctx.font = `400 34px ${font}`;
    ctx.fillText('工時 ' + data.workedText, W / 2, 470);

    const lines = data.lines.slice(0, 4);
    const top = 520, rowH = 92;
    lines.forEach((ln, i) => {
      const y = top + i * (rowH + 12);
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      rr(ctx, 90, y, W - 180, rowH, 24); ctx.fill();
      ctx.textAlign = 'left'; ctx.fillStyle = '#eceef3'; ctx.font = `600 38px ${font}`;
      ctx.fillText(ln.label, 130, y + 60);
      ctx.textAlign = 'right'; ctx.fillStyle = '#ffb020'; ctx.font = `800 44px ${font}`;
      ctx.fillText(ln.value, W - 130, y + 62);
    });

    ctx.textAlign = 'center'; ctx.fillStyle = '#6f768a'; ctx.font = `400 22px ${font}`;
    ctx.fillText('薪資等值僅供參考,不代表扣稅與其他成本後的可支配金額', W / 2, H - 56);
    ctx.fillText('牛馬薪水計', W / 2, H - 24);
  }

  function toBlob(canvas) {
    return new Promise((res) => canvas.toBlob(res, 'image/png'));
  }

  return { draw, toBlob };
})();
