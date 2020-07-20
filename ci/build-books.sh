#!/bin/bash

set -ex

MDBOOK_URL="https://github.com/rust-lang/mdBook/releases/download/v0.4.1/mdbook-v0.4.1-x86_64-unknown-linux-gnu.tar.gz"
FIX_CJK_SPACING_PLUGIN_URL="https://github.com/lotabout/mdbook-fix-cjk-spacing/releases/download/v0.1.1/mdbook-fix-cjk-spacing-v0.1.1-x86_64-unknown-linux-gnu.tar.gz"

DIR=$(cd `dirname $0`; pwd)
TOPDIR=$DIR/..
TARGET_DIR=$TOPDIR/public/books

# ensure folder in publish folder
if [ ! -d $TARGET_DIR ]; then
    mkdir -p $TARGET_DIR
fi

cd $DIR
export PATH="$DIR:$PATH"
wget $MDBOOK_URL
tar xf $(basename $MDBOOK_URL)
wget $FIX_CJK_SPACING_PLUGIN_URL
tar xf $(basename $FIX_CJK_SPACING_PLUGIN_URL)

cd $TOPDIR
for book in $(find books -type d -mindepth 1 -maxdepth 1); do
    echo "Building $book"
    cd $TOPDIR/$book
    mdbook build

    echo "copy to publish folder"
    BOOK_NAME=$(basename $book)
    if [ -d $TARGET_DIR/$BOOK_NAME ]; then
        rm -rf $TARGET_DIR/$BOOK_NAME
    fi
    mv book $TARGET_DIR/$BOOK_NAME
done
