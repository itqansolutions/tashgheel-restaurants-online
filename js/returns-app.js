// returns-app.js - Enterprise Grade Refund System

document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.getElementById('return-form');
  const itemsForm = document.getElementById('return-items-form');
  const itemsContainer = document.getElementById('receipt-items');
  const itemsBody = document.getElementById('return-items-body');

  // Hybrid Translation Helper
  const t = (keyOrEn, ar) => {
    const lang = localStorage.getItem('pos_language') || 'en';
    if (ar) return lang === 'ar' ? ar : keyOrEn;
    if (window.translations && window.translations[keyOrEn]) {
      return window.translations[keyOrEn][lang];
    }
    return keyOrEn;
  };

  let currentReceipt = null;

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const receiptIdInput = document.getElementById('receipt-id').value.trim();

    // Use window.electronAPI.getSalesHistory to find the receipt
    // Since we don't have getSaleById from API directly exposed in frontend lib yet, 
    // we might need to rely on the history fetch. 
    // Ideally, we should add `getSale` to electronAPI/web-adapter.
    // For now, let's try to fetch history and find it, or use a direct fetch if available.

    try {
      itemsContainer.style.display = 'none';
      itemsBody.innerHTML = '<tr><td colspan="4">Searching...</td></tr>';

      // Try fetching specific sale if we knew the endpoint, but let's use the history list for now
      // or better, let's just fetch all recent and filter client side as a fallback
      // But for enterprise, we should really have a direct lookup.
      // Let's assume we can use the history endpoint with a limit.

      // NOTE: The ID might be short (last 6) or full MongoID.
      const result = await window.electronAPI.getSalesHistory({ limit: 100 });
      const sales = result.sales || [];

      currentReceipt = sales.find(s =>
        (s._id === receiptIdInput) ||
        (s.id === receiptIdInput) ||
        (s._id.slice(-6).toUpperCase() === receiptIdInput.toUpperCase())
      );

      if (!currentReceipt) {
        alert(t('Receipt not found', 'الفاتورة غير موجودة'));
        return;
      }

      if (currentReceipt.status === 'refunded' || currentReceipt.status === 'void') {
        alert(t('Receipt already refunded/voided', 'الفاتورة مسترجعة أو ملغاة بالفعل'));
        return;
      }

      // Display items for selection
      itemsBody.innerHTML = '';
      currentReceipt.items.forEach((item, idx) => {
        const row = document.createElement('tr');
        row.innerHTML = `
                    <td class="p-2"><input type="checkbox" name="return-item" value="${idx}" checked disabled /></td>
                    <td class="p-2">${item.name}</td>
                    <td class="p-2">${item.qty}</td>
                    <td class="p-2 text-red-500 font-bold">${t('Full Refund Only', 'استرجاع كامل فقط')}</td>
                `;
        itemsBody.appendChild(row);
      });

      itemsContainer.style.display = 'block';

    } catch (err) {
      console.error('Search Error:', err);
      alert(t('Error searching for receipt', 'خطأ في البحث عن الفاتورة'));
    }
  });

  itemsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentReceipt) return;

    const reason = prompt(t('Enter refund reason:', 'أدخل سبب الاسترجاع:'));
    if (!reason) return;

    const confirmRefund = confirm(t('Are you sure you want to refund this entire receipt?', 'هل أنت متأكد من استرجاع كامل الفاتورة؟'));
    if (!confirmRefund) return;

    try {
      // Call API to refund
      // We need to use raw fetch or add to electronAPI. 
      // web-adapter uses fetch directly.

      const response = await window.apiFetch(`/sales/refund/${currentReceipt._id || currentReceipt.id}`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });

      if (response.success) {
        alert(t('Refund Successful', 'تم الاسترجاع بنجاح'));
        itemsContainer.style.display = 'none';
        itemsForm.reset();
        searchForm.reset();
        currentReceipt = null;
      } else {
        alert(t('Refund Failed', 'فشل الاسترجاع') + ': ' + (response.error || 'Unknown'));
      }

    } catch (err) {
      console.error('Refund Error:', err);
      alert(t('Refund Failed', 'فشل الاسترجاع'));
    }
  });
});
