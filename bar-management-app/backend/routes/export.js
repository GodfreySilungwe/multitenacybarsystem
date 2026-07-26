const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');

// Helper function to format date
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'Export routes are working!' });
});

// Export Sales Report as Excel
router.get('/sales/excel', async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('customer', 'name phone')
      .populate('items.product', 'name')
      .sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    // Headers
    worksheet.columns = [
      { header: 'Order #', key: 'orderNumber', width: 20 },
      { header: 'Customer', key: 'customer', width: 25 },
      { header: 'Items', key: 'items', width: 15 },
      { header: 'Total Amount (MK)', key: 'totalAmount', width: 20 },
      { header: 'Profit (MK)', key: 'profit', width: 18 },
      { header: 'Payment Method', key: 'paymentMethod', width: 18 },
      { header: 'Date', key: 'date', width: 25 }
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE94560' }
    };
    headerRow.alignment = { horizontal: 'center' };

    // Add data rows with formatted date
    orders.forEach(order => {
      worksheet.addRow({
        orderNumber: order.orderNumber,
        customer: order.customer?.name || 'Walk-in',
        items: order.items.length,
        totalAmount: order.totalAmount,
        profit: order.profit,
        paymentMethod: order.paymentMethod.replace('_', ' '),
        date: formatDate(order.createdAt)
      });
    });

    // Add totals row
    const totalSales = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalProfit = orders.reduce((sum, o) => sum + o.profit, 0);
    
    const totalsRow = worksheet.addRow({
      orderNumber: 'TOTALS',
      customer: '',
      items: orders.length,
      totalAmount: totalSales,
      profit: totalProfit,
      paymentMethod: '',
      date: ''
    });
    totalsRow.font = { bold: true };
    totalsRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0F0' }
    };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=sales_report.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Export Inventory Report as Excel
router.get('/inventory/excel', async (req, res) => {
  try {
    const products = await Product.find().populate('category', 'name');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inventory Report');

    worksheet.columns = [
      { header: 'Product Name', key: 'name', width: 30 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Cost Price (MK)', key: 'costPrice', width: 18 },
      { header: 'Selling Price (MK)', key: 'sellingPrice', width: 18 },
      { header: 'Current Stock', key: 'currentStock', width: 15 },
      { header: 'Low Stock Threshold', key: 'threshold', width: 20 },
      { header: 'Status', key: 'status', width: 18 }
    ];

    // Style header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3498DB' }
    };
    headerRow.alignment = { horizontal: 'center' };

    products.forEach(product => {
      const status = product.currentStock <= product.lowStockThreshold ? '⚠️ Low Stock' : '✅ In Stock';
      worksheet.addRow({
        name: product.name,
        category: product.category?.name || 'Uncategorized',
        costPrice: product.costPrice,
        sellingPrice: product.sellingPrice,
        currentStock: product.currentStock,
        threshold: product.lowStockThreshold,
        status: status
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=inventory_report.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Export Customers Report as Excel
router.get('/customers/excel', async (req, res) => {
  try {
    const customers = await Customer.find().sort({ totalSpent: -1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Customers Report');

    worksheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Gender', key: 'gender', width: 12 },
      { header: 'Total Spent (MK)', key: 'totalSpent', width: 20 },
      { header: 'Loyalty Points', key: 'points', width: 18 },
      { header: 'Joined', key: 'joined', width: 25 }
    ];

    // Style header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF9B59B6' }
    };
    headerRow.alignment = { horizontal: 'center' };

    customers.forEach(customer => {
      worksheet.addRow({
        name: customer.name,
        phone: customer.phone,
        gender: customer.gender,
        totalSpent: customer.totalSpent || 0,
        points: customer.loyaltyPoints || 0,
        joined: formatDate(customer.createdAt)
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=customers_report.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Export Sales Report as PDF
router.get('/sales/pdf', async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('customer', 'name phone')
      .populate('items.product', 'name')
      .sort({ createdAt: -1 });

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=sales_report.pdf');

    doc.pipe(res);

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('Sales Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown();

    // Summary
    const totalSales = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalProfit = orders.reduce((sum, o) => sum + o.profit, 0);
    
    doc.fontSize(14).font('Helvetica-Bold');
    doc.text(`Total Orders: ${orders.length}`, 50, doc.y);
    doc.text(`Total Sales: MK ${totalSales.toFixed(2)}`, 300, doc.y - 20);
    doc.text(`Total Profit: MK ${totalProfit.toFixed(2)}`, 300, doc.y);
    doc.moveDown(2);

    // Table Headers
    const tableTop = doc.y;
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Order #', 50, tableTop);
    doc.text('Customer', 150, tableTop);
    doc.text('Items', 280, tableTop);
    doc.text('Amount', 350, tableTop);
    doc.text('Payment', 430, tableTop);
    doc.text('Date', 500, tableTop);
    
    // Draw header line
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
    
    doc.moveDown();
    let y = doc.y;
    doc.font('Helvetica');

    orders.forEach((order, index) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
        // Repeat headers on new page
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Order #', 50, y);
        doc.text('Customer', 150, y);
        doc.text('Items', 280, y);
        doc.text('Amount', 350, y);
        doc.text('Payment', 430, y);
        doc.text('Date', 500, y);
        doc.moveTo(50, y + 15).lineTo(550, y + 15).stroke();
        y += 25;
        doc.font('Helvetica');
      }
      
      // Alternate row colors
      if (index % 2 === 0) {
        doc.rect(45, y - 2, 510, 18).fillAndStroke('#f5f5f5', '#f5f5f5');
      }
      
      // Format date properly
      const formattedDate = new Date(order.createdAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      doc.text(order.orderNumber, 50, y);
      doc.text(order.customer?.name || 'Walk-in', 150, y);
      doc.text(order.items.length.toString(), 280, y);
      doc.text(`MK ${order.totalAmount.toFixed(2)}`, 350, y);
      doc.text(order.paymentMethod.replace('_', ' '), 430, y);
      doc.text(formattedDate, 500, y);
      y += 20;
    });

    // Footer
    doc.moveDown(2);
    doc.fontSize(10).font('Helvetica');
    doc.text('Report generated by Bar Manager System', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;