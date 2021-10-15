const fs = require('fs');
const path = require('path');
const PdfDocument = require('pdfkit');
const stripe = require('stripe')('sk_test_51Jknq6JVTc8WPDX4PgEYdTYkJnLIre9qObQgxcjxA8VE6R4vDAHXH1K309Q9DTKikj9K9ZY5dlessEKvIO74vkkH00VIdy2B7Q');
const Product = require('../models/product');
const Order = require('../models/order');
const throwErrorFn = require('../util/throw-error');
const ITEMS_PER_PAGE = 2;

exports.getProducts = (req, res, next) => {
    const page = Number(req.query.page) || 1;
    let totalItems;
    Product.find()
        .countDocuments()
        .then(numProducts => {
            totalItems = numProducts;
            return Product.find()
                .skip((page - 1) * ITEMS_PER_PAGE)
                .limit(ITEMS_PER_PAGE)
        })
        .then(products => {
            res.render('shop/product-list', {
                prods: products,
                pageTitle: 'All Products',
                path: '/products',
                currentPage: page,
                totalProducts: totalItems,
                hasNextPage: ITEMS_PER_PAGE * page < totalItems,
                hasPreviousPage: page > 1,
                nextPage: page + 1,
                previousPage: page - 1,
                lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE)
            });
        })
        .catch(err => throwErrorFn(next, err));
};

exports.getProduct = (req, res, next) => {
    const prodId = req.params.productId;
    Product.findById(prodId)
        .then(product => {
            res.render('shop/product-detail', {
                product: product,
                pageTitle: product.title,
                path: '/products'
            });
        })
        .catch(err => throwErrorFn(next, err));
};

exports.getIndex = (req, res, next) => {
    const page = Number(req.query.page) || 1;
    let totalItems;
    Product.find().countDocuments()
        .then(numProducts => {
            totalItems = numProducts;
            return Product.find()
                .skip((page - 1) * ITEMS_PER_PAGE)
                .limit(ITEMS_PER_PAGE)
        })
        .then(products => {
            res.render('shop/index', {
                prods: products,
                pageTitle: 'Shop',
                path: '/',
                currentPage: page,
                totalProducts: totalItems,
                hasNextPage: ITEMS_PER_PAGE * page < totalItems,
                hasPreviousPage: page > 1,
                nextPage: page + 1,
                previousPage: page - 1,
                lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE)
            });
        })
        .catch(err => throwErrorFn(next, err));
};

exports.getCart = (req, res, next) => {
    req.user.populate('cart.items.productId')
        .then(user => {
            const products = user.cart.items;
            res.render('shop/cart', {
                path: '/cart',
                pageTitle: 'Your Cart',
                products: products
            });
        })
        .catch(err => throwErrorFn(next, err));
};

exports.postCart = (req, res, next) => {
    const prodId = req.body.productId;
    Product.findById(prodId)
        .then(product => req.user.addToCart(product))
        .then(() => res.redirect('/cart'))
        .catch(err => throwErrorFn(next, err));
};

exports.postCartDeleteProduct = (req, res, next) => {
    const prodId = req.body.productId;
    req.user.removeFromCart(prodId)
        .then(() => res.redirect('/cart'))
        .catch(err => throwErrorFn(next, err));
};

exports.getCheckoutSuccess = (req, res, next) => {
    req.user
        .populate('cart.items.productId')
        .then(user => {
            const products = user.cart.items.map(i => {
                return {quantity: i.quantity, productData: {...i.productId._doc}};
            });
            const order = new Order({
                user: {
                    email: req.user.email,
                    userId: req.user
                },
                products: products
            });
            return order.save();
        })
        .then(() => req.user.clearCart())
        .then(() => res.redirect('/orders'))
        .catch(err => throwErrorFn(next, err));
};

exports.getOrders = (req, res, next) => {
    Order.find({'user.userId': req.user._id})
        .then(orders => {
            res.render('shop/orders', {
                path: '/orders',
                pageTitle: 'Orders',
                orders
            })
        })
        .catch(err => throwErrorFn(next, err));
}

exports.getInvoice = (req, res, next) => {
    const orderId = req.params.orderId;
    Order.findById(orderId)
        .then(order => {
            if (!order) {
                return throwErrorFn(next, new Error('No order found!'));
            }
            if (order.user.userId.toString() !== req.user._id.toString()) {
                return throwErrorFn(next, new Error('Unauthorized'));
            }
            const invoiceName = `invoice-${orderId}.pdf`;
            const invoicePath = path.join('data', 'invoices', invoiceName);
            const pdfDoc = new PdfDocument();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${invoiceName}"`); // can be inline, attachment

            pdfDoc.pipe(fs.createWriteStream(invoicePath));
            pdfDoc.pipe(res);

            pdfDoc.fontSize(26).text('Invoice', {underline: true});
            pdfDoc.text('---------------------');
            let totalPrice = 0;
            order.products.forEach(p => {
                pdfDoc.fontSize(14).text(`${p.productData.title} - ${p.quantity} x $${p.productData.price}`);
                totalPrice += p.quantity * p.productData.price;
            });
            pdfDoc.text('---------------------');
            pdfDoc.fontSize(20).text(`Total price: $${totalPrice}`);
            pdfDoc.end();
        })
        .catch(err => throwErrorFn(next, err));
}

exports.getCheckout = (req, res, next) => {
    let products;
    let totalSum = 0;
    req.user
        .populate('cart.items.productId')
        .then(user => {
            products = user.cart.items;
            totalSum = products.reduce((acc, curr) => {
                return acc + curr.quantity * curr.productId.price
            }, 0)

            return stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: products.map(p => {
                    return {
                        name: p.productId.title,
                        description: p.productId.description,
                        amount: p.productId.price * 100,
                        currency: 'usd', // cents
                        quantity: p.quantity
                    }
                }),
                success_url: `${req.protocol}://${req.get('host')}/checkout/success`,
                cancel_url: `${req.protocol}://${req.get('host')}/checkout/cancel`
            })
        })
        .then(session => {
            res.render('shop/checkout', {
                path: '/checkout',
                pageTitle: 'Checkout',
                products,
                totalSum,
                sessionId: session.id
            });
        })
        .catch(err => throwErrorFn(next, err));
}
