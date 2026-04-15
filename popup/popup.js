function showColor(color) {
    document.getElementById('colorPreview').style.backgroundColor = color;
}

document.getElementById("btnPick").addEventListener("click", pickcolor);
async function pickcolor() 
{
    try 
    {
        const dropper = new EyeDropper();
        const result = await dropper.open();
        const color = result.sRGBHex;

        showColor(color);
    } catch (error) 
    {
        console.error(error);
    }
}