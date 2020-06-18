#!/bin/bash

set -x

DIR=$(cd `dirname $0`; pwd)
TOPDIR=$DIR/..
TARGET_DIR=$TOPDIR/public/books

# ensure folder in publish folder
if [ ! -d $TARGET_DIR ]; then
    mkdir -p $TARGET_DIR
fi

for book in $(find books -type d -d 1); do
    echo "Building $book"
    cd $TOPDIR/$book
    gitbook build

    echo "copy to publish folder"
    BOOK_NAME=$(basename $book)
    if [ -d $TARGET_DIR/$BOOK_NAME ]; then
        rm -rf $TARGET_DIR/$BOOK_NAME
    fi
    mv _book $TARGET_DIR/$BOOK_NAME
done
