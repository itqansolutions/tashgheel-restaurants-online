// returns-app.js

document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.getElementById('return-form');
  const itemsForm = document.getElementById('return-items-form');
  const itemsContainer = document.getElementById('receipt-items');
  const itemsBody = document.getElementById('return-items-body');

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const receiptId = document.getElementById('receipt-id').value.trim();
    const receiptData = JSON.parse(localStorage.getItem(`receipt_${receiptId}`));

    if (!receiptData) {
      alert('Receipt not found.');
      return;
    }

    // Display items for selection
    itemsBody.innerHTML = '';
    receiptData.items.forEach((item, idx) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><input type="checkbox" name="return-item" value="${idx}" /></td>
        <td>${item.name}</td>
        <td>${item.qty}</td>
      `;
      itemsBody.appendChild(row);
    });

    itemsContainer.style.display = 'block';
  });

  itemsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const receiptId = document.getElementById('receipt-id').value.trim();
    const receiptData = JSON.parse(localStorage.getItem(`receipt_${receiptId}`));
    const selectedIndexes = Array.from(document.querySelectorAll('input[name="return-item"]:checked'))
      .map(input => parseInt(input.value));

    if (!selectedIndexes.length) {
      alert('Please select items to return.');
      return;
    }

    // Refund logic: reduce stock
    const products = JSON.parse(localStorage.getItem('products') || '[]');

    selectedIndexes.forEach(index => {
      const item = receiptData.items[index];
      const prod = products.find(p => p.name === item.name);
      if (prod) {
        prod.stock += item.qty;
      }
    });

    localStorage.setItem('products', JSON.stringify(products));
    alert('Items returned and stock updated.');
    itemsContainer.style.display = 'none';
    itemsForm.reset();
    searchForm.reset();
  });
});
