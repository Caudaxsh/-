/* 薪水成果卡(canvas 匯出圖)。只接收「已格式化的顯示資料」,不碰時薪、公司名稱。
 * logo 與商品圖示取用素材包內的獨立 PNG,保持原比例。 */
window.ShareCard = (function () {
  const FONT = '"Noto Sans TC","Microsoft JhengHei","Yu Gothic","Meiryo","Segoe UI",sans-serif';

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  /** 在 (x,y,w,h) 的盒子內以 contain 方式畫圖,不拉伸 */
  function contain(ctx, img, x, y, w, h) {
    if (!img) return;
    const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  /**
   * data: { title, todayLabel, footer, brand, dateText, amountText|null, workedText, lines:[{label,value,icon?:Image}], logo?:Image }
   */
  function draw(canvas, data) {
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F8F4EE'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#DCC9B6'; ctx.lineWidth = 3;
    rr(ctx, 40, 40, W - 80, H - 80, 36); ctx.fillStyle = '#FFFCF7'; ctx.fill(); ctx.stroke();

    contain(ctx, data.logo, W / 2 - 50, 80, 100, 130);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4A3428'; ctx.font = `700 46px ${FONT}`;
    ctx.fillText(data.title, W / 2, 262);
    ctx.fillStyle = '#7D6757'; ctx.font = `400 28px ${FONT}`;
    ctx.fillText(data.dateText, W / 2, 304);

    ctx.fillStyle = '#7D6757'; ctx.font = `400 28px ${FONT}`;
    ctx.fillText(data.todayLabel, W / 2, 366);
    ctx.fillStyle = '#4A3428'; ctx.font = `700 ${data.amountText ? 112 : 84}px ${FONT}`;
    ctx.fillText(data.amountText || '＊＊＊', W / 2, 470);
    ctx.fillStyle = '#7D6757'; ctx.font = `400 30px ${FONT}`;
    ctx.fillText(data.workedText, W / 2, 520);

    const lines = data.lines.slice(0, 3);
    const top = 570, rowH = 104;
    lines.forEach((ln, i) => {
      const y = top + i * (rowH + 14);
      ctx.fillStyle = '#F3EAE0';
      rr(ctx, 100, y, W - 200, rowH, 24); ctx.fill();
      contain(ctx, ln.icon, 118, y + 10, 84, rowH - 20);
      ctx.textAlign = 'left'; ctx.fillStyle = '#4A3428'; ctx.font = `600 36px ${FONT}`;
      ctx.fillText(ln.label, 224, y + 64);
      ctx.textAlign = 'right'; ctx.fillStyle = '#9A6F50'; ctx.font = `700 44px ${FONT}`;
      ctx.fillText(ln.value, W - 128, y + 66);
    });

    ctx.textAlign = 'center'; ctx.fillStyle = '#7D6757'; ctx.font = `400 22px ${FONT}`;
    ctx.fillText(data.footer, W / 2, H - 82);
    ctx.fillText(data.brand + ' WorkHorse', W / 2, H - 52);
  }

  const toBlob = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));
  return { draw, toBlob };
})();
