const throwErrorFn = (next, err) => {
    const error = new Error(err);
    error.httpStatusCode = 500;
    next(error);
}

module.exports = throwErrorFn;
