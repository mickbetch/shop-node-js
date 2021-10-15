const { validationResult } = require('express-validator');
const Product = require('../models/product');
const fileHelper = require('../util/file');
const throwErrorFn = require('../util/throw-error');

exports.getAddProduct = (req, res, next) => {
  res.render('admin/edit-product', {
    pageTitle: 'Add Product',
    path: '/admin/add-product',
    editing: false,
    hasError: false,
    errorMessage: null,
    validationErrors: []
  });
};

exports.postAddProduct = (req, res, next) => {
  const {title, price, description} = req.body;
  const image = req.file;
  if (!image) {
    return res.status(422).render('admin/edit-product', {
      pageTitle: 'Add Product',
      path: '/admin/add-product',
      editing: false,
      hasError: true,
      product: {
        title: title,
        price: price,
        description: description
      },
      errorMessage: 'Attached file is not an image.',
      validationErrors: []
    });
  }
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).render('admin/edit-product', {
      pageTitle: 'Add Product',
      path: '/admin/add-product',
      editing: false,
      hasError: true,
      product: {
        title: title,
        price: price,
        description: description
      },
      errorMessage: errors.array()[0].msg,
      validationErrors: errors.array()
    });
  }

  const imageUrl = image.path;

  const product = new Product({
    // _id: new mongoose.Types.ObjectId('5badf72403fd8b5be0366e81'),
    title: title,
    price: price,
    description: description,
    imageUrl: imageUrl,
    userId: req.user
  });
  product.save()
    .then(() => res.redirect('/admin/products'))
    .catch(err => throwErrorFn(next, err));
};

exports.getEditProduct = (req, res, next) => {
  const editMode = req.query.edit;
  if (!editMode) { return res.redirect('/'); }
  const prodId = req.params.productId;
  Product.findById(prodId)
    .then(product => {
      if (!product) { return res.redirect('/'); }
      res.render('admin/edit-product', {
        pageTitle: 'Edit Product',
        path: '/admin/edit-product',
        editing: editMode,
        product: product,
        hasError: false,
        errorMessage: null,
        validationErrors: []
      });
    })
    .catch(err => throwErrorFn(next, err));
};

exports.postEditProduct = (req, res, next) => {
  const {productId, title, price, description} = req.body;
  const image = req.file;
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).render('admin/edit-product', {
      pageTitle: 'Edit Product',
      path: '/admin/edit-product',
      editing: true,
      hasError: true,
      product: {title, price, description, _id: productId},
      errorMessage: errors.array()[0].msg,
      validationErrors: errors.array()
    });
  }

  Product.findById(productId)
    .then(product => {
      if (product.userId.toString() !== req.user._id.toString()) {
        return res.redirect('/');
      }
      product.title = title;
      product.price = price;
      product.description = description;
      if (image) {
        fileHelper.deleteFile(product.imageUrl);
        product.imageUrl = image.path;
      }
      return product.save()
          .then(() => res.redirect('/admin/products'));
    })
      .catch(err => throwErrorFn(next, err));
};

exports.getProducts = (req, res, next) => {
  Product.find({ userId: req.user._id })
    // .select('title price -_id')
    // .populate('userId', 'name')
    .then(products => {
      console.log(products);
      res.render('admin/products', {
        prods: products,
        pageTitle: 'Admin Products',
        path: '/admin/products'
      });
    })
    .catch(err => throwErrorFn(next, err));
};

exports.deleteProduct = (req, res, next) => {
  const prodId = req.params.productId;
  Product.findById(prodId)
      .then(product => {
        if (!product) {
          return throwErrorFn(next, new Error('Product not found.'));
        }
        fileHelper.deleteFile(product.imageUrl);
        return Product.deleteOne({ _id: prodId, userId: req.user._id })
      })
      .then(() => res.status(200).json({message: 'Success'}))
      .catch(() => res.status(500).json({message: 'Deleting product failed'}));
};
