
// Get the folder containing the PNG files
var inputFolder = Folder.selectDialog("Select the folder containing the PSD files");
var inputFiles = inputFolder.getFiles("*.psd");

var outputFolder = Folder.selectDialog("Select the output folder");

alert(app.path)

for (var i = 0; i < inputFiles.length; i++) {
    // Open the PNG file
    var file = inputFiles[i];
    var doc = app.open(file);


    var doc = app.activeDocument
    var repeatCount = 5;

    for (var j = 0; j < repeatCount; j++) {

        var randHue = Math.floor(Math.random() * 360);
        var randSat = Math.floor(Math.random() * 100);
        var randBri = Math.floor(Math.random() * 100);


        // =======================================================
        var idsetd = charIDToTypeID( "setd" );
            var desc66 = new ActionDescriptor();
            var idnull = charIDToTypeID( "null" );
                var ref16 = new ActionReference();
                var idClr = charIDToTypeID( "Clr " );
                var idFrgC = charIDToTypeID( "FrgC" );
                ref16.putProperty( idClr, idFrgC );
            desc66.putReference( idnull, ref16 );
            var idT = charIDToTypeID( "T   " );
                var desc67 = new ActionDescriptor();
                var idH = charIDToTypeID( "H   " );
                var idAng = charIDToTypeID( "#Ang" );
                desc67.putUnitDouble( idH, idAng, randHue );
                var idStrt = charIDToTypeID( "Strt" );
                desc67.putDouble( idStrt, randSat );
                var idBrgh = charIDToTypeID( "Brgh" );
                desc67.putDouble( idBrgh, randBri );
            var idHSBC = charIDToTypeID( "HSBC" );
            desc66.putObject( idT, idHSBC, desc67 );
            var idSrce = charIDToTypeID( "Srce" );
            desc66.putString( idSrce, """photoshopPicker""" );
        executeAction( idsetd, desc66, DialogModes.NO );


        // =======================================================
        var idslct = charIDToTypeID( "slct" );
            var desc18 = new ActionDescriptor();
            var idnull = charIDToTypeID( "null" );
                var ref8 = new ActionReference();
                var idLyr = charIDToTypeID( "Lyr " );
                ref8.putName( idLyr, "banner" );
            desc18.putReference( idnull, ref8 );
            var idMkVs = charIDToTypeID( "MkVs" );
            desc18.putBoolean( idMkVs, false );
            var idLyrI = charIDToTypeID( "LyrI" );
                var list4 = new ActionList();
                list4.putInteger( 9 );
            desc18.putList( idLyrI, list4 );
        executeAction( idslct, desc18, DialogModes.NO );


        // =======================================================
        var idFl = charIDToTypeID( "Fl  " );
            var desc92 = new ActionDescriptor();
            var idFrom = charIDToTypeID( "From" );
                var desc93 = new ActionDescriptor();
                var idHrzn = charIDToTypeID( "Hrzn" );
                var idPxl = charIDToTypeID( "#Pxl" );
                desc93.putUnitDouble( idHrzn, idPxl, 1263.000000 );
                var idVrtc = charIDToTypeID( "Vrtc" );
                var idPxl = charIDToTypeID( "#Pxl" );
                desc93.putUnitDouble( idVrtc, idPxl, 0.000000 );
            var idPnt = charIDToTypeID( "Pnt " );
            desc92.putObject( idFrom, idPnt, desc93 );
            var idTlrn = charIDToTypeID( "Tlrn" );
            desc92.putInteger( idTlrn, 32 );
            var idAntA = charIDToTypeID( "AntA" );
            desc92.putBoolean( idAntA, true );
            var idUsng = charIDToTypeID( "Usng" );
            var idFlCn = charIDToTypeID( "FlCn" );
            var idFrgC = charIDToTypeID( "FrgC" );
            desc92.putEnumerated( idUsng, idFlCn, idFrgC );
        executeAction( idFl, desc92, DialogModes.NO );


        // =======================================================
        var idslct = charIDToTypeID( "slct" );
            var desc111 = new ActionDescriptor();
            var idnull = charIDToTypeID( "null" );
                var ref25 = new ActionReference();
                var idLyr = charIDToTypeID( "Lyr " );
                ref25.putName( idLyr, "bottom" );
            desc111.putReference( idnull, ref25 );
            var idMkVs = charIDToTypeID( "MkVs" );
            desc111.putBoolean( idMkVs, false );
            var idLyrI = charIDToTypeID( "LyrI" );
                var list7 = new ActionList();
                list7.putInteger( 4 );
            desc111.putList( idLyrI, list7 );
        executeAction( idslct, desc111, DialogModes.NO );


        // =======================================================
        var idFl = charIDToTypeID( "Fl  " );
            var desc100 = new ActionDescriptor();
            var idFrom = charIDToTypeID( "From" );
                var desc101 = new ActionDescriptor();
                var idHrzn = charIDToTypeID( "Hrzn" );
                var idPxl = charIDToTypeID( "#Pxl" );
                desc101.putUnitDouble( idHrzn, idPxl, 126.000000 );
                var idVrtc = charIDToTypeID( "Vrtc" );
                var idPxl = charIDToTypeID( "#Pxl" );
                desc101.putUnitDouble( idVrtc, idPxl, 945.000000 );
            var idPnt = charIDToTypeID( "Pnt " );
            desc100.putObject( idFrom, idPnt, desc101 );
            var idTlrn = charIDToTypeID( "Tlrn" );
            desc100.putInteger( idTlrn, 32 );
            var idAntA = charIDToTypeID( "AntA" );
            desc100.putBoolean( idAntA, true );
            var idUsng = charIDToTypeID( "Usng" );
            var idFlCn = charIDToTypeID( "FlCn" );
            var idFrgC = charIDToTypeID( "FrgC" );
            desc100.putEnumerated( idUsng, idFlCn, idFrgC );
        executeAction( idFl, desc100, DialogModes.NO );


        // Save the modified PNG file in the output folder
        var newFileName = doc.name.slice(0, -4) + i + j + ".png";
        var outputFileName = outputFolder + "/" + newFileName;
        var saveOptions = new ExportOptionsSaveForWeb();
        saveOptions.PNG8 = false;
        saveOptions.transparency = true;
        saveOptions.interlaced = false;
        saveOptions.quality = 100;
        saveOptions.includeProfile = false;
        saveOptions.format = SaveDocumentType.PNG; 
        doc.exportDocument(new File(outputFileName), ExportType.SAVEFORWEB, saveOptions);
    }

    // Close the document without saving changes
    doc.close(SaveOptions.DONOTSAVECHANGES);
}