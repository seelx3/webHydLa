import $ from 'jquery';
import { CommonData } from "./common";

// $(document).ready(function () {
let common = new CommonData();
// });






function toggleInputPane() {
  var elm = document.getElementById("left-pane");
  var tgl = document.getElementById("v-toggle-icon");
  if (elm.getAttribute("style")) {
    elm.removeAttribute("style");
    tgl.classList.remove("mdi-navigation-chevron-right");
    tgl.classList.add("mdi-navigation-chevron-left");
  } else {
    elm.style.width = "0px";
    tgl.classList.remove("mdi-navigation-chevron-left");
    tgl.classList.add("mdi-navigation-chevron-right");
  }
  startResizingGraphArea();
}


// function onExecButtonClick() {
//   if (hylagi_running) {
//     killHyLaGI();
//   }
//   else {
//     EditorControl.sendHydLa();
//   }
// }

// function getErrorMessage(sid) {
//   var form = document.createElement("form");
//   form.action = "error.cgi";
//   form.method = "post";
//   var id = document.createElement("input");
//   id.type = "hidden";
//   id.name = "sid";
//   id.value = sid;
//   // document.getElementById("graph").contentDocument.body.appendChild(form); // ???
//   form.appendChild(id);
//   form.submit();
// }



/* function to enable/disable input field */
// function connecttext(elemID, ischeckded) {
//   var elm = document.getElementById(elemID);
//   if (ischeckded == true) {
//     elm.disabled = false;
//     elm.classList.remove("hide");
//   } else {
//     elm.disabled = true;
//     elm.classList.add("hide");
//   }
// }
